import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type Dispatch, type SetStateAction, type ReactNode, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Copy, ExternalLink, Store, Eye, EyeOff, Check, RefreshCw, Save,
  Type, Palette, Layout, Sparkles, ImageIcon as ImgIcon, RotateCcw,
  GripVertical, Wand2, Upload, Trash2, Plus, Lock, LayoutGrid, Star,
  ChevronUp, ChevronDown, Smartphone, Tablet, Monitor, X as XIcon,
  PanelLeftClose, PanelLeftOpen, Share2, Play, Undo2, Redo2, MoreHorizontal,
  Heading1, AlignLeft, Video, MousePointerClick, Minus, MoveVertical,
  Search, Command, CornerDownLeft, ChevronRight, SlidersHorizontal,
  Layers, Palette as PaletteIcon, Move, Maximize2, MousePointer2,
  Bold, Italic, Underline, Strikethrough, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Hand, HelpCircle, FileText, MessageCircle, Link2,
  ArrowLeft, ArrowUpToLine, ArrowDownToLine, Settings2, ClipboardPaste, Unlock,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "react-router-dom";
import { z } from "zod";
import {
  DEFAULT_THEME, type StoreTheme, type SectionKey, SECTION_LABELS,
  resolveTheme, type OverlayImage, THEME_PRESETS,
  type SpecialSectionItem, type ElementStyle, type TextOverlay,
  type CustomBlock,
} from "@/lib/storeTheme";
import { uploadImage } from "@/lib/uploadImage";
import type { StoreTemplate } from "@/components/store/templates";
import { buildUniqueStoreSlug, ensureUserProfile, fallbackBusinessName, slugifyStoreName } from "@/lib/storeSlug";
import { CommandPalette } from "@/editor/components/palette/CommandPalette";
import { DropdownRow, FixedMenu, MenuDivider, SimpleDropdown } from "@/editor/components/primitives/EditorDropdown";
import { BlocksSidebar } from "@/editor/components/sidebar/BlocksSidebar";
import { SettingsSidebar } from "@/editor/components/settings/SettingsSidebar";
import { ElementInspector } from "@/editor/components/inspector/ElementInspector";
import { ElementQuickToolbar } from "@/editor/components/toolbars/ElementQuickToolbar";
import { RichTextQuickBar } from "@/editor/components/toolbars/RichTextQuickBar";
import { ColorPropertyEditor, NumberPropertyEditor, SelectPropertyEditor, TextPropertyEditor } from "@/document/inspector/editors";
import { INSERT_ITEMS, INSPECTOR_PROFILES } from "@/editor/constants/editorConstants";
import { createEditorUIStore } from "@/editor/stores/editorUIStore";
import type { Bp, EditorElement, EditorSnapshot, PaletteCommand } from "@/editor/types/editor";
import { classifyElement, supportsInspectorFeature } from "@/editor/utils/elementClassification";


const slugify = slugifyStoreName;

const profileSchema = z.object({
  store_slug: z.string().trim().min(3).max(40).regex(/^[a-z0-9-]+$/, "Lowercase, numbers, hyphens"),
  business_name: z.string().trim().min(1).max(100),
});

// Once a business name is set, it's permanent (per product spec).
// Slug is also locked once saved to prevent breaking customer links.

const MyStore = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState<"style" | "copy" | "any" | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [items, setItems] = useState<any[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);
  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<"mobile" | "tablet" | "desktop" | "custom">("desktop");
  const [previewW, setPreviewW] = useState<number>(1280);
  const [previewH, setPreviewH] = useState<number>(900);
  const [zoom, setZoom] = useState<number>(75); // percent
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSection, setActiveSection] = useState<SectionKey | null>("hero");
  const [activeTab, setActiveTab] = useState<string>("branding");
  const [selectedEl, setSelectedElRaw] = useState<EditorElement | null>(null);
  const [selectedRect, setSelectedRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [selectedEls, setSelectedEls] = useState<EditorElement[]>([]);
  const [selectedRects, setSelectedRects] = useState<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const [aiPrompt, setAiPrompt] = useState("");
  const [knownElements, setKnownElements] = useState<EditorElement[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ===== New: inspector tabs, context menu, canvas tools, notes, help =====
  const [inspectorTab, setInspectorTab] = useState<"style" | "advanced" | "interactions">("style");
  const [contextMenu, setContextMenu] = useState<{ id: string; clientX: number; clientY: number } | null>(null);
  const [canvasTool, setCanvasTool] = useState<"select" | "pan">("select");
  const [showGrid, setShowGrid] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [elementNotes, setElementNotes] = useState<Record<string, string>>({});
  const [, forceTick] = useState(0);
  const activeStyleBp: Bp = device === "mobile" ? "mobile" : device === "tablet" ? "tablet" : "desktop";
  type EditorClipboardItem = {
    id: string;
    label?: string;
    tag?: string;
    block?: CustomBlock;
    desktop?: ElementStyle;
    tablet?: ElementStyle;
    mobile?: ElementStyle;
    text?: string;
    locked?: boolean;
  };
  const editorClipboardRef = useRef<EditorClipboardItem[] | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);

  const selectElements = (
    elements: EditorElement[],
    rects: Record<string, { x: number; y: number; width: number; height: number }> = {},
  ) => {
    const unique = elements.filter((element, index, list) => element?.id && list.findIndex((candidate) => candidate.id === element.id) === index);
    const primary = unique[unique.length - 1] ?? null;
    const primaryRect = primary ? (rects[primary.id] ?? null) : null;
    setSelectedEls((current) => {
      const same =
        current.length === unique.length &&
        current.every((element, index) => element.id === unique[index]?.id && element.label === unique[index]?.label && element.tag === unique[index]?.tag);
      return same ? current : unique;
    });
    setSelectedRects((current) => {
      const sameKeys = Object.keys(current).length === Object.keys(rects).length;
      const sameRects =
        sameKeys &&
        Object.entries(rects).every(([id, rect]) => {
          const currentRect = current[id];
          return (
            currentRect?.x === rect.x &&
            currentRect?.y === rect.y &&
            currentRect?.width === rect.width &&
            currentRect?.height === rect.height
          );
        });
      return sameRects ? current : rects;
    });
    setSelectedElRaw((current) => {
      if (
        current?.id === primary?.id &&
        current?.label === primary?.label &&
        current?.tag === primary?.tag &&
        current?.text === primary?.text &&
        current?.kind === primary?.kind &&
        current?.childCount === primary?.childCount
      ) return current;
      return primary;
    });
    setSelectedRect((current) => {
      const next = primaryRect;
      return current?.x === next?.x && current?.y === next?.y && current?.width === next?.width && current?.height === next?.height
        ? current
        : next;
    });
    setContextMenu((current) => current ? null : current);
    if (primary) setInspectorTab((current) => current === "style" ? current : "style");
  };

  /** Selecting an element clears any stale rect/context-menu unless a rect is explicitly supplied. */
  const selectElement = (
    el: EditorElement | null,
    rect?: { x: number; y: number; width: number; height: number } | null,
  ) => selectElements(el ? [el] : [], el && rect ? { [el.id]: rect } : {});
  const setSelectedEl = (el: typeof selectedEl) => selectElement(el, null);
  const clearSelection = () => selectElements([], {});

  // ===== Resizable + persisted panel widths (left insert panel, right inspector) =====
  const readStoredWidth = (key: string, fallback: number) => {
    if (typeof window === "undefined") return fallback;
    const v = Number(window.localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  const [leftWidth, setLeftWidth] = useState(() => readStoredWidth("sb-left-w", 264));
  const [rightWidth, setRightWidth] = useState(() => readStoredWidth("sb-right-w", 336));
  const [resizing, setResizing] = useState<"left" | "right" | null>(null);
  const startResize = (side: "left" | "right") => (e: ReactMouseEvent) => {
    e.preventDefault();
    setResizing(side);
    const startX = e.clientX;
    const startW = side === "left" ? leftWidth : rightWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = side === "left" ? ev.clientX - startX : startX - ev.clientX;
      const next = Math.min(480, Math.max(220, Math.round(startW + delta)));
      if (side === "left") setLeftWidth(next); else setRightWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setResizing(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  useEffect(() => { window.localStorage.setItem("sb-left-w", String(leftWidth)); }, [leftWidth]);
  useEffect(() => { window.localStorage.setItem("sb-right-w", String(rightWidth)); }, [rightWidth]);

  const [form, setForm] = useState({
    business_name: "",
    store_slug: "",
    store_tagline: "",
    store_about: "",
    store_color: "#5669ff",
    store_banner_url: "",
    store_template: "minimal" as StoreTemplate,
    banners: [] as string[],
    special_sections: [] as SpecialSectionItem[],
  });
  const [theme, setTheme] = useState<StoreTheme>(DEFAULT_THEME);
  const [nameChangesLeft, setNameChangesLeft] = useState(3);
  const [originalName, setOriginalName] = useState("");
  const nameLocked = nameChangesLeft <= 0;
  const [slugLocked, setSlugLocked] = useState(false);
  const activeStyleBpRef = useRef<Bp>(activeStyleBp);
  const selectedElRef = useRef<EditorElement | null>(selectedEl);
  const themeRef = useRef<StoreTheme>(theme);
  const formRef = useRef(form);
  useEffect(() => { activeStyleBpRef.current = activeStyleBp; }, [activeStyleBp]);
  useEffect(() => { selectedElRef.current = selectedEl; }, [selectedEl]);
  useEffect(() => { themeRef.current = theme; }, [theme]);
  useEffect(() => { formRef.current = form; }, [form]);

  const load = useCallback(async () => {
    if (!user) return;
    let prof = await ensureUserProfile(user);
    if (!prof.store_slug) {
      const store_slug = await buildUniqueStoreSlug(prof.business_name || fallbackBusinessName(user), user.id);
      const { data: repaired } = await supabase.from("profiles").update({ store_slug }).eq("id", user.id).select("*").single();
      if (repaired) prof = repaired;
    }
    if (prof) {
      setForm({
        business_name: prof.business_name ?? "",
        store_slug: prof.store_slug ?? "",
        store_tagline: prof.store_tagline ?? "",
        store_about: prof.store_about ?? "",
        store_color: prof.store_color ?? "#00000",
        store_banner_url: prof.store_banner_url ?? "",
        store_template: ((prof as any).store_template ?? "minimal") as StoreTemplate,
        banners: Array.isArray((prof as any).banners) ? ((prof as any).banners as string[]) : [],
        special_sections: Array.isArray((prof as any).special_sections) ? ((prof as any).special_sections as SpecialSectionItem[]) : [],
      });
      const nc = Math.max(0, 3 - (((prof as any).name_change_count as number) ?? 0));
      setNameChangesLeft(prof.business_name ? nc : 3);
      setOriginalName(prof.business_name ?? "");
      setSlugLocked(!!prof.store_slug);
      setTheme(resolveTheme((prof as any).theme, prof.store_color ?? undefined));
      const { data: its } = await supabase.from("items").select("id, name, category").eq("user_id", user.id).limit(200);
      setItems(its ?? []);
    }
    setLoading(false);
  }, [user]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setTheme((th) => ({ ...th, accent: form.store_color })); }, [form.store_color]);

  // ===== Live broadcast theme/store changes to the iframe preview (no save needed) =====
  const broadcast = (msg: any) => iframeRef.current?.contentWindow?.postMessage(msg, "*");
  useEffect(() => { broadcast({ type: "apply-theme", theme }); }, [theme]);
  useEffect(() => { broadcast({ type: "apply-store", store: form }); }, [form]);
  useEffect(() => { broadcast({ type: "toggle-grid", on: showGrid }); }, [showGrid]);
  useEffect(() => {
    broadcast({ type: "set-selection", ids: selectedEls.map((element) => element.id) });
  }, [previewKey, selectedEls]);
  useEffect(() => {
    if (device === "mobile") { setPreviewW(375); setPreviewH(720); }
    else if (device === "tablet") { setPreviewW(768); setPreviewH(1024); }
    else if (device === "desktop") { setPreviewW(1280); setPreviewH(900); }
  }, [device]);

  // ===== Receive edits from the iframe (inline text + overlay drag/delete) =====
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const m = e.data;
      if (!m || typeof m !== "object") return;
      if (m.type === "editor-ready") {
        broadcast({ type: "apply-theme", theme: themeRef.current });
        broadcast({ type: "apply-store", store: formRef.current });
      } else if (m.type === "edit-text" && m.key) {
        dispatchSnapshotCommand("Edit text", (draft) => {
          draft.theme.text_overrides = { ...draft.theme.text_overrides, [m.key]: m.value };
          return draft;
        });
      } else if (m.type === "overlay-move") {
        setTheme((th) => ({ ...th, overlays: th.overlays.map((o) => (o.id === m.id ? { ...o, x: m.x, y: m.y } : o)) }));
      } else if (m.type === "overlay-resize") {
        setTheme((th) => ({ ...th, overlays: th.overlays.map((o) => (o.id === m.id ? { ...o, w: m.w } : o)) }));
      } else if (m.type === "overlay-delete") {
        setTheme((th) => ({ ...th, overlays: th.overlays.filter((o) => o.id !== m.id) }));
      } else if (m.type === "select-elements" && Array.isArray(m.elements)) {
        const rects =
          m.rects && typeof m.rects === "object"
            ? Object.fromEntries(
                Object.entries(m.rects).filter((entry): entry is [string, { x: number; y: number; width: number; height: number }] => {
                  const rect = entry[1] as any;
                  return rect && typeof rect.x === "number" && typeof rect.y === "number" && typeof rect.width === "number" && typeof rect.height === "number";
                }),
              )
            : {};
        selectElements(
          m.elements
            .filter((el: any) => el && typeof el.id === "string")
            .map((el: any) => ({
              id: el.id,
              label: el.label || el.id,
              tag: el.tag,
              replaceable: !!el.replaceable,
              text: typeof el.text === "string" ? el.text : undefined,
              kind: el.kind,
              childCount: typeof el.childCount === "number" ? el.childCount : undefined,
              display: el.display,
            })),
          rects,
        );
      } else if (m.type === "page-settings") {
        clearSelection();
        setActiveTab("layout");
      } else if (m.type === "select-element" && m.id) {
        // `rect` is optional: { x, y, width, height } in the iframe's own (unscaled) coordinate
        // space, e.g. element.getBoundingClientRect() taken inside the storefront document.
        // When present, the floating quick-toolbars snap exactly over the element.
        selectElement(
          { id: m.id, label: m.label || m.id, tag: m.tag, replaceable: !!m.replaceable, text: typeof m.text === "string" ? m.text : undefined },
          m.rect && typeof m.rect.x === "number" ? { x: m.rect.x, y: m.rect.y, width: m.rect.width, height: m.rect.height } : null,
        );
      } else if (m.type === "element-context-menu" && m.id) {
        // Sent on right-click inside the storefront: { id, label, tag, x, y } where x/y are the
        // click position in the iframe's own coordinate space (e.clientX/e.clientY in that document).
        const r = iframeRef.current?.getBoundingClientRect();
        const scaleNow = zoom / 100;
        selectElement({ id: m.id, label: m.label || m.id, tag: m.tag, replaceable: !!m.replaceable, text: m.text });
        if (r) setContextMenu({ id: m.id, clientX: r.left + (m.x ?? 0) * scaleNow, clientY: r.top + (m.y ?? 0) * scaleNow });
      } else if (m.type === "text-overlay-move" && m.id) {
        setTheme((th) => ({ ...th, text_overlays: th.text_overlays.map((o) => (o.id === m.id ? { ...o, x: m.x, y: m.y } : o)) }));
      } else if (m.type === "text-overlay-delete" && m.id) {
        setTheme((th) => ({ ...th, text_overlays: th.text_overlays.filter((o) => o.id !== m.id) }));
      } else if (m.type === "element-resize" && m.id) {
        const bp = activeStyleBpRef.current;
        const patch: Partial<ElementStyle> = { width: m.width, height: m.height };
        if (typeof m.transform === "string") {
          patch.position = "relative";
          patch.transform = m.transform;
        }
        if (typeof m.fontSize === "number") patch.fontSize = m.fontSize;
        if (typeof m.display === "string") patch.display = m.display;
        queueLiveStyleUpdate(m.id, patch, bp);
        if (m.rect && typeof m.rect.x === "number" && typeof m.rect.y === "number" && typeof m.rect.width === "number" && typeof m.rect.height === "number") {
          const nextRect = { x: m.rect.x, y: m.rect.y, width: m.rect.width, height: m.rect.height };
          setSelectedRects((current) => ({ ...current, [m.id]: nextRect }));
          if (selectedElRef.current?.id === m.id) setSelectedRect(nextRect);
        }
      } else if (m.type === "element-move" && m.id) {
        queueLiveStyleUpdate(m.id, { position: "relative", transform: m.transform }, activeStyleBpRef.current);
      } else if (m.type === "element-resize-batch" && Array.isArray(m.updates)) {
        const bp = activeStyleBpRef.current;
        const nextRects: Record<string, { x: number; y: number; width: number; height: number }> = {};
        m.updates.forEach((entry: any) => {
          if (!entry || typeof entry.id !== "string") return;
          const patch: Partial<ElementStyle> = {};
          if (typeof entry.width === "string") patch.width = entry.width;
          if (typeof entry.height === "string") patch.height = entry.height;
          if (typeof entry.transform === "string") {
            patch.position = "relative";
            patch.transform = entry.transform;
          }
          if (typeof entry.fontSize === "number") patch.fontSize = entry.fontSize;
          if (typeof entry.display === "string") patch.display = entry.display;
          if (Object.keys(patch).length) queueLiveStyleUpdate(entry.id, patch, bp);
          if (entry.rect && typeof entry.rect.x === "number" && typeof entry.rect.y === "number" && typeof entry.rect.width === "number" && typeof entry.rect.height === "number") {
            nextRects[entry.id] = { x: entry.rect.x, y: entry.rect.y, width: entry.rect.width, height: entry.rect.height };
          }
        });
        if (Object.keys(nextRects).length) {
          setSelectedRects((current) => ({ ...current, ...nextRects }));
          setSelectedRect((current) => {
            const primaryId = selectedElRef.current?.id;
            return primaryId && nextRects[primaryId] ? nextRects[primaryId] : current;
          });
        }
      } else if (m.type === "element-move-batch" && Array.isArray(m.transforms)) {
        const bp = activeStyleBpRef.current;
        const nextRects: Record<string, { x: number; y: number; width: number; height: number }> = {};
        m.transforms.forEach((entry: any) => {
          if (!entry || typeof entry.id !== "string" || typeof entry.transform !== "string") return;
          queueLiveStyleUpdate(entry.id, { position: "relative", transform: entry.transform }, bp);
          if (entry.rect && typeof entry.rect.x === "number") {
            nextRects[entry.id] = entry.rect;
          }
        });
        if (Object.keys(nextRects).length) {
          setSelectedRects((current) => ({ ...current, ...nextRects }));
          setSelectedRect((current) => {
            const primaryId = selectedElRef.current?.id;
            return primaryId && nextRects[primaryId] ? nextRects[primaryId] : current;
          });
        }
      } else if (m.type === "element-delete" && m.id) {
        deleteElements([m.id]);
      } else if (m.type === "select-text-overlay" && m.id) {
        // no-op for now: we surface text overlays in the brand panel
      } else if (m.type === "element-text" && m.id) {
        if (typeof m.id === "string" && m.id.startsWith("cblock-")) {
          const bid = m.id.slice("cblock-".length);
          updateCustomBlockProps(bid, { text: m.value });
        } else {
          setElementText(m.id, m.value);
        }
      } else if (m.type === "elements-inventory" && Array.isArray(m.elements)) {
        setKnownElements(m.elements);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // Keep floating toolbars glued to the element while the canvas scrolls.
  useEffect(() => {
    const el = canvasScrollRef.current;
    if (!el) return;
    const onScroll = () => forceTick((t) => t + 1);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // ===== Phase 6: Command-backed undo / redo history =====
  type Snap = {
    theme: StoreTheme;
    banners: string[];
    special_sections: SpecialSectionItem[];
    store_color: string;
    store_template: StoreTemplate;
    store_banner_url: string;
    store_tagline: string;
    store_about: string;
  };
  type EditorCommandPayload = {
    before: Snap;
    after: Snap;
    mergeKey?: string;
  };
  type EditorCommand = {
    id: string;
    type: string;
    label: string;
    timestamp: number;
    payload: EditorCommandPayload;
    execute: () => void;
    undo: () => void;
    redo?: () => void;
    merge?: (next: EditorCommand) => EditorCommand | null;
  };
  const undoStackRef = useRef<EditorCommand[]>([]);
  const redoStackRef = useRef<EditorCommand[]>([]);
  const lastSnapRef = useRef<Snap | null>(null);
  const applyingHistoryRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const cloneData = <T,>(value: T): T => {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
  };
  const buildSnap = (): Snap => cloneData({
    theme,
    banners: form.banners,
    special_sections: form.special_sections,
    store_color: form.store_color,
    store_template: form.store_template,
    store_banner_url: form.store_banner_url,
    store_tagline: form.store_tagline,
    store_about: form.store_about,
  });
  const applySnap = (s: Snap) => {
    applyingHistoryRef.current = true;
    setTheme(cloneData(s.theme));
    setForm((f) => ({
      ...f,
      banners: cloneData(s.banners),
      special_sections: cloneData(s.special_sections),
      store_color: s.store_color,
      store_template: s.store_template,
      store_banner_url: s.store_banner_url,
      store_tagline: s.store_tagline,
      store_about: s.store_about,
    }));
  };
  const snapsEqual = (a: Snap, b: Snap) => JSON.stringify(a) === JSON.stringify(b);
  const updateHistoryState = () => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  };
  const createSnapshotCommand = (label: string, before: Snap, after: Snap, mergeKey?: string): EditorCommand => {
    const command: EditorCommand = {
      id: `editor-command-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: mergeKey?.startsWith("nudge:") ? "keyboard:nudge" : "editor:snapshot",
      label,
      timestamp: Date.now(),
      payload: { before, after, mergeKey },
      execute: () => applySnap(after),
      undo: () => applySnap(before),
    };
    command.merge = (next) => {
      if (!mergeKey || !next.payload.mergeKey || mergeKey !== next.payload.mergeKey) return null;
      if (next.timestamp - command.timestamp > 500) return null;
      return createSnapshotCommand(next.label, before, next.payload.after, mergeKey);
    };
    return command;
  };
  const recordCommand = (command: EditorCommand) => {
    const top = undoStackRef.current[undoStackRef.current.length - 1];
    const merged = top?.merge?.(command);
    if (merged) undoStackRef.current[undoStackRef.current.length - 1] = merged;
    else {
      undoStackRef.current.push(command);
      if (undoStackRef.current.length > 100) undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    lastSnapRef.current = cloneData(command.payload.after);
    updateHistoryState();
  };
  const dispatchSnapshotCommand = (label: string, mutate: (draft: Snap) => Snap, mergeKey?: string) => {
    flushLiveStyleUpdates();
    const before = buildSnap();
    const after = cloneData(mutate(cloneData(before)));
    if (snapsEqual(before, after)) return false;
    const command = createSnapshotCommand(label, before, after, mergeKey);
    command.execute();
    recordCommand(command);
    return true;
  };
  const undo = () => {
    flushLiveStyleUpdates();
    const command = undoStackRef.current.pop();
    if (!command) return;
    command.undo();
    redoStackRef.current.push(command);
    lastSnapRef.current = cloneData(command.payload.before);
    updateHistoryState();
  };
  const redo = () => {
    flushLiveStyleUpdates();
    const command = redoStackRef.current.pop();
    if (!command) return;
    (command.redo ?? command.execute)();
    undoStackRef.current.push(command);
    lastSnapRef.current = cloneData(command.payload.after);
    updateHistoryState();
  };
  useEffect(() => {
    if (loading) return;
    if (applyingHistoryRef.current) { applyingHistoryRef.current = false; return; }
    if (!lastSnapRef.current) {
      lastSnapRef.current = buildSnap();
      updateHistoryState();
      return;
    }
    const t = setTimeout(() => {
      const snap = buildSnap();
      const before = lastSnapRef.current;
      if (!before || snapsEqual(before, snap)) return;
      recordCommand(createSnapshotCommand("Edit storefront", before, snap));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, form.banners, form.special_sections, form.store_color, form.store_template, form.store_banner_url, form.store_tagline, form.store_about, loading]);

  const clearHistory = () => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    lastSnapRef.current = buildSnap();
    updateHistoryState();
  };

  // ===== Autosave (debounced) — persists every tweak so refresh never loses inline edits.
  const autosaveSkipRef = useRef(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "dirty" | "error">("idle");
  useEffect(() => {
    if (!user || loading) return;
    if (autosaveSkipRef.current) { autosaveSkipRef.current = false; return; }
    setSaveState("dirty");
    const t = setTimeout(async () => {
      setSaveState("saving");
      const { error } = await supabase.from("profiles").update({
        theme: theme as any,
        banners: form.banners as any,
        special_sections: form.special_sections as any,
        store_color: form.store_color,
        store_template: form.store_template,
        store_banner_url: form.store_banner_url || null,
        store_tagline: form.store_tagline || null,
        store_about: form.store_about || null,
      } as any).eq("id", user.id);
      setSaveState(error ? "error" : "saved");
      if (!error) setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, form.banners, form.special_sections, form.store_color, form.store_template, form.store_banner_url, form.store_tagline, form.store_about]);

  // ===== Restore last saved state from DB =====
  const restore = async () => {
    if (!confirm("Discard unsaved local edits and restore the last saved storefront?")) return;
    autosaveSkipRef.current = true;
    applyingHistoryRef.current = true;
    await load();
    clearHistory();
    setSaveState("idle");
    toast({ title: "Restored", description: "Reloaded your last saved storefront." });
  };

  // ===== Element style helpers (responsive: desktop | tablet | mobile) =====
  const styleMapKey = (bp: Bp) =>
    bp === "mobile" ? "element_styles_mobile" : bp === "tablet" ? "element_styles_tablet" : "element_styles";
  const writeSnapStyle = (snap: Snap, id: string, patch: Partial<ElementStyle>, bp: Bp = "desktop") => {
    const key = styleMapKey(bp);
    const current = ((snap.theme as any)[key] ?? {}) as Record<string, ElementStyle>;
    (snap.theme as any)[key] = { ...current, [id]: { ...(current[id] ?? {}), ...patch } };
  };
  const removeSnapStyle = (snap: Snap, id: string, bp: Bp = "desktop") => {
    const key = styleMapKey(bp);
    const current = ((snap.theme as any)[key] ?? {}) as Record<string, ElementStyle>;
    const { [id]: _, ...rest } = current;
    (snap.theme as any)[key] = rest;
  };
  const pendingLiveStyleUpdatesRef = useRef(new Map<string, { id: string; bp: Bp; patch: Partial<ElementStyle> }>());
  const liveStyleFrameRef = useRef<number | null>(null);
  const applyLiveStyleUpdates = (base: StoreTheme, updates: { id: string; bp: Bp; patch: Partial<ElementStyle> }[]) => {
    if (updates.length === 0) return base;
    const next = { ...base } as StoreTheme;
    for (const update of updates) {
      const key = styleMapKey(update.bp);
      const current = ((next as any)[key] ?? {}) as Record<string, ElementStyle>;
      (next as any)[key] = {
        ...current,
        [update.id]: { ...(current[update.id] ?? {}), ...update.patch },
      };
    }
    return next;
  };
  const flushLiveStyleUpdates = (snapshot?: StoreTheme) => {
    if (liveStyleFrameRef.current !== null) {
      window.cancelAnimationFrame(liveStyleFrameRef.current);
      liveStyleFrameRef.current = null;
    }
    const updates = [...pendingLiveStyleUpdatesRef.current.values()];
    pendingLiveStyleUpdatesRef.current.clear();
    if (updates.length === 0) return snapshot;
    setTheme((current) => applyLiveStyleUpdates(current, updates));
    return snapshot ? applyLiveStyleUpdates(snapshot, updates) : undefined;
  };
  const queueLiveStyleUpdate = (id: string, patch: Partial<ElementStyle>, bp: Bp = activeStyleBpRef.current) => {
    const key = `${bp}:${id}`;
    const current = pendingLiveStyleUpdatesRef.current.get(key);
    pendingLiveStyleUpdatesRef.current.set(key, { id, bp, patch: { ...current?.patch, ...patch } });
    if (liveStyleFrameRef.current !== null) return;
    liveStyleFrameRef.current = window.requestAnimationFrame(() => {
      liveStyleFrameRef.current = null;
      flushLiveStyleUpdates();
    });
  };
  useEffect(() => () => {
    if (liveStyleFrameRef.current !== null) window.cancelAnimationFrame(liveStyleFrameRef.current);
    pendingLiveStyleUpdatesRef.current.clear();
  }, []);
  const getStyleFor = (id: string, bp: Bp = activeStyleBp): ElementStyle => {
    const key = styleMapKey(bp);
    const map = ((theme as any)[key] ?? {}) as Record<string, ElementStyle>;
    return map[id] ?? {};
  };
  const updateElStyle = (id: string, patch: Partial<ElementStyle>, bp: Bp = activeStyleBp) => {
    dispatchSnapshotCommand("Update element style", (draft) => {
      writeSnapStyle(draft, id, patch, bp);
      return draft;
    });
  };
  const clearElStyle = (id: string, bp: Bp = activeStyleBp) => {
    dispatchSnapshotCommand("Clear element style", (draft) => {
      removeSnapStyle(draft, id, bp);
      return draft;
    });
  };
  const setElementText = (id: string, value: string) =>
    dispatchSnapshotCommand("Edit element text", (draft) => {
      draft.theme.element_text = { ...(draft.theme.element_text ?? {}), [id]: value };
      return draft;
    });
  const setElementLink = (id: string, link: import("@/lib/storeTheme").ElementLink | null) =>
    dispatchSnapshotCommand("Update element link", (draft) => {
      const next = { ...(draft.theme.element_links ?? {}) };
      if (!link) delete next[id]; else next[id] = link;
      draft.theme.element_links = next;
      return draft;
    });

  // ===== Phase 2: lock, clipboard style, and custom block helpers =====
  const setElementLock = (id: string, locked: boolean) =>
    dispatchSnapshotCommand(locked ? "Lock element" : "Unlock element", (draft) => {
      const next = { ...(draft.theme.element_locks ?? {}) };
      if (locked) next[id] = true; else delete next[id];
      draft.theme.element_locks = next;
      return draft;
    });
  const styleClipboardRef = useRef<{ desktop?: ElementStyle; tablet?: ElementStyle; mobile?: ElementStyle } | null>(null);
  const copyStyleOf = (id: string) => {
    styleClipboardRef.current = {
      desktop: theme.element_styles?.[id],
      tablet: theme.element_styles_tablet?.[id],
      mobile: theme.element_styles_mobile?.[id],
    };
    toast({ title: "Style copied", description: "Select another element and click Paste style." });
  };
  const pasteStyleTo = (id: string) => {
    const c = styleClipboardRef.current;
    if (!c) { toast({ title: "Nothing to paste", description: "Copy a style first.", variant: "destructive" }); return; }
    dispatchSnapshotCommand("Paste style", (draft) => {
      writeSnapStyle(draft, id, c.desktop ?? {}, "desktop");
      writeSnapStyle(draft, id, c.tablet ?? {}, "tablet");
      writeSnapStyle(draft, id, c.mobile ?? {}, "mobile");
      return draft;
    });
    toast({ title: "Style pasted" });
  };
  const addCustomBlock = (kind: import("@/lib/storeTheme").CustomBlockKind, section: SectionKey, initial: Partial<import("@/lib/storeTheme").CustomBlock["props"]> = {}) => {
    const id = crypto.randomUUID();
    dispatchSnapshotCommand("Insert block", (draft) => {
      const list = Array.isArray(draft.theme.custom_blocks) ? draft.theme.custom_blocks : [];
      const orderInSection = list.filter((b) => b.section === section).length;
      const props: any = { ...initial };
      if (kind === "heading" && !props.text) props.text = "New heading";
      if (kind === "text" && !props.text) props.text = "New paragraph. Double-click to edit.";
      if (kind === "button" && !props.text) props.text = "Click me";
      if (kind === "spacer" && props.height == null) props.height = 48;
      if (kind === "icon" && !props.icon) props.icon = "✨";
      draft.theme.custom_blocks = [...list, { id, section, kind, order: orderInSection, props }];
      return draft;
    });
    setTimeout(() => selectElement({ id: `cblock-${id}`, label: `${kind.charAt(0).toUpperCase() + kind.slice(1)} block` }), 200);
    toast({ title: `${kind} block added`, description: `Placed in ${SECTION_LABELS[section]}. Click it in the preview to edit.` });
  };
  const removeCustomBlock = (blockId: string) =>
    dispatchSnapshotCommand("Delete block", (draft) => {
      draft.theme.custom_blocks = (draft.theme.custom_blocks ?? []).filter((b) => b.id !== blockId);
      return draft;
    });
  const duplicateCustomBlock = (blockId: string) =>
    dispatchSnapshotCommand("Duplicate block", (draft) => {
      const list = draft.theme.custom_blocks ?? [];
      const b = list.find((x) => x.id === blockId);
      if (!b) return draft;
      const nid = crypto.randomUUID();
      draft.theme.custom_blocks = [...list, { ...b, id: nid, order: list.filter((x) => x.section === b.section).length, props: { ...b.props } }];
      return draft;
    });
  const moveCustomBlock = (blockId: string, dir: -1 | 1) =>
    dispatchSnapshotCommand("Move block", (draft) => {
      const list = [...(draft.theme.custom_blocks ?? [])];
      const b = list.find((x) => x.id === blockId);
      if (!b) return draft;
      const siblings = list.filter((x) => x.section === b.section).sort((a, z) => a.order - z.order);
      const idx = siblings.findIndex((x) => x.id === blockId);
      const swap = siblings[idx + dir];
      if (!swap) return draft;
      const bOrder = b.order, sOrder = swap.order;
      draft.theme.custom_blocks = list.map((x) => x.id === b.id ? { ...x, order: sOrder } : x.id === swap.id ? { ...x, order: bOrder } : x);
      return draft;
    });
  const updateCustomBlockProps = (blockId: string, patch: Partial<import("@/lib/storeTheme").CustomBlock["props"]>) =>
    dispatchSnapshotCommand("Update block", (draft) => {
      draft.theme.custom_blocks = (draft.theme.custom_blocks ?? []).map((b) => b.id === blockId ? { ...b, props: { ...b.props, ...patch } } : b);
      return draft;
    });

  // ===== Phase 6 clipboard: copy is read-only; cut/paste/duplicate dispatch commands. =====
  const buildClipboardItem = (id: string): EditorClipboardItem | null => {
    const blockId = id.startsWith("cblock-") ? id.slice("cblock-".length) : null;
    const block = blockId ? (theme.custom_blocks ?? []).find((candidate) => candidate.id === blockId) : undefined;
    const element = selectedEls.find((candidate) => candidate.id === id) ?? knownElements.find((candidate) => candidate.id === id);
    return {
      id,
      label: element?.label,
      tag: element?.tag,
      block: block ? cloneData(block) : undefined,
      desktop: cloneData(theme.element_styles?.[id] ?? {}),
      tablet: cloneData(theme.element_styles_tablet?.[id] ?? {}),
      mobile: cloneData(theme.element_styles_mobile?.[id] ?? {}),
      text: theme.element_text?.[id] ?? element?.text,
      locked: !!theme.element_locks?.[id],
    };
  };
  const copyElements = (ids: string[] = selectedIds) => {
    const itemsToCopy = ids.map(buildClipboardItem).filter((item): item is EditorClipboardItem => !!item);
    if (!itemsToCopy.length) {
      toast({ title: "Nothing selected", description: "Select an element before copying.", variant: "destructive" });
      return false;
    }
    editorClipboardRef.current = cloneData(itemsToCopy);
    setHasClipboard(true);
    toast({ title: itemsToCopy.length > 1 ? "Elements copied" : "Element copied", description: "Use Ctrl+V to paste." });
    return true;
  };
  const copyElement = (id: string) => copyElements([id]);
  const deleteElements = (ids: string[] = selectedIds, label = ids.length > 1 ? "Delete elements" : "Delete element") => {
    const targetIds = ids.filter(Boolean);
    if (!targetIds.length) return false;
    const didDelete = dispatchSnapshotCommand(label, (draft) => {
      const customIds = new Set(targetIds.filter((id) => id.startsWith("cblock-")).map((id) => id.slice("cblock-".length)));
      if (customIds.size) draft.theme.custom_blocks = (draft.theme.custom_blocks ?? []).filter((block) => !customIds.has(block.id));
      targetIds.forEach((id) => {
        if (!id.startsWith("cblock-")) writeSnapStyle(draft, id, { hidden: true }, "desktop");
      });
      return draft;
    });
    if (didDelete) clearSelection();
    return didDelete;
  };
  const cutElements = (ids: string[] = selectedIds) => {
    if (!copyElements(ids)) return false;
    return deleteElements(ids, ids.length > 1 ? "Cut elements" : "Cut element");
  };
  const pasteElement = (targetSection?: SectionKey) => {
    const itemsToPaste = editorClipboardRef.current;
    if (!itemsToPaste?.length) {
      toast({ title: "Nothing to paste", description: "Copy an element first.", variant: "destructive" });
      return;
    }
    const pastedIds: string[] = [];
    const selectedTarget = selectedEls.length === 1 ? selectedEls[0]?.id : null;
    const onlyTemplateOverrides = itemsToPaste.every((item) => !item.block);
    dispatchSnapshotCommand("Paste elements", (draft) => {
      if (onlyTemplateOverrides && selectedTarget) {
        const item = itemsToPaste[0];
        writeSnapStyle(draft, selectedTarget, item.desktop ?? {}, "desktop");
        writeSnapStyle(draft, selectedTarget, item.tablet ?? {}, "tablet");
        writeSnapStyle(draft, selectedTarget, item.mobile ?? {}, "mobile");
        if (item.text) draft.theme.element_text = { ...(draft.theme.element_text ?? {}), [selectedTarget]: item.text };
        return draft;
      }
      let list = [...(draft.theme.custom_blocks ?? [])];
      itemsToPaste.forEach((item) => {
        const source = item.block;
        if (!source) return;
        const section = targetSection ?? activeSection ?? source.section;
        const nid = crypto.randomUUID();
        const nextBlock = { ...source, id: nid, section, order: list.filter((block) => block.section === section).length, props: { ...source.props } };
        list = [...list, nextBlock];
        const newStyleId = `cblock-${nid}`;
        pastedIds.push(newStyleId);
        writeSnapStyle(draft, newStyleId, item.desktop ?? {}, "desktop");
        writeSnapStyle(draft, newStyleId, item.tablet ?? {}, "tablet");
        writeSnapStyle(draft, newStyleId, item.mobile ?? {}, "mobile");
        if (item.text) draft.theme.element_text = { ...(draft.theme.element_text ?? {}), [newStyleId]: item.text };
        if (item.locked) draft.theme.element_locks = { ...(draft.theme.element_locks ?? {}), [newStyleId]: true };
      });
      draft.theme.custom_blocks = list;
      return draft;
    });
    if (pastedIds.length === 1) setTimeout(() => selectElement({ id: pastedIds[0], label: "Block" }), 120);
    toast({ title: pastedIds.length ? "Pasted" : "Overrides pasted" });
  };
  const duplicateElements = (ids: string[] = selectedIds) => {
    const itemsToDuplicate = ids.map(buildClipboardItem).filter((item): item is EditorClipboardItem => !!item);
    if (!itemsToDuplicate.length) return false;
    const duplicatedIds: string[] = [];
    const didDuplicate = dispatchSnapshotCommand(ids.length > 1 ? "Duplicate elements" : "Duplicate element", (draft) => {
      let list = [...(draft.theme.custom_blocks ?? [])];
      itemsToDuplicate.forEach((item) => {
        const source = item.block;
        const section = activeSection ?? source?.section ?? "hero";
        const nid = crypto.randomUUID();
        const newStyleId = `cblock-${nid}`;
        const inferredKind: CustomBlock["kind"] =
          source?.kind ??
          (item.tag === "IMG" ? "image" : item.tag === "BUTTON" || item.tag === "A" ? "button" : /H[1-6]/.test(item.tag ?? "") ? "heading" : "text");
        const nextBlock: CustomBlock = source
          ? { ...source, id: nid, order: list.filter((block) => block.section === section).length, section, props: { ...source.props } }
          : {
              id: nid,
              section,
              kind: inferredKind,
              order: list.filter((block) => block.section === section).length,
              props: { text: item.text || item.label || "Duplicated element" },
            };
        list = [...list, nextBlock];
        duplicatedIds.push(newStyleId);
        writeSnapStyle(draft, newStyleId, item.desktop ?? {}, "desktop");
        writeSnapStyle(draft, newStyleId, item.tablet ?? {}, "tablet");
        writeSnapStyle(draft, newStyleId, item.mobile ?? {}, "mobile");
        if (item.text) draft.theme.element_text = { ...(draft.theme.element_text ?? {}), [newStyleId]: item.text };
      });
      draft.theme.custom_blocks = list;
      return draft;
    });
    if (didDuplicate && duplicatedIds.length === 1) setTimeout(() => selectElement({ id: duplicatedIds[0], label: "Duplicated block" }), 120);
    return didDuplicate;
  };

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (key === "escape") {
        setContextMenu(null);
        clearSelection();
        return;
      }
      if (!selectedIds.length && key !== "v") return;
      if (mod && key === "c") {
        e.preventDefault();
        copyElements();
        return;
      }
      if (mod && key === "x") {
        e.preventDefault();
        cutElements();
        return;
      }
      if (mod && key === "v") {
        e.preventDefault();
        pasteElement();
        return;
      }
      if (mod && key === "d") {
        e.preventDefault();
        duplicateElements();
        return;
      }
      if (key === "delete" || key === "backspace") {
        e.preventDefault();
        deleteElements();
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      if (key === "arrowleft") { e.preventDefault(); nudgeSelectedElements(-step, 0); }
      else if (key === "arrowright") { e.preventDefault(); nudgeSelectedElements(step, 0); }
      else if (key === "arrowup") { e.preventDefault(); nudgeSelectedElements(0, -step); }
      else if (key === "arrowdown") { e.preventDefault(); nudgeSelectedElements(0, step); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ===== Rich-text / quick-format helpers. Bold uses the existing `fontWeight` field; italic,
  // underline, strikethrough, uppercase, list style and text-shadow "effects" are all routed
  // through the existing free-form `customCss` passthrough so nothing new needs to be added to
  // the theme schema. =====
  const toggleCustomCss = (id: string, key: string, onValue: any, bp: Bp = activeStyleBp) => {
    const cur = getStyleFor(id, bp);
    const has = (cur.customCss as any)?.[key] === onValue;
    const nextCss: Record<string, any> = { ...(cur.customCss ?? {}) };
    if (has) delete nextCss[key]; else nextCss[key] = onValue;
    updateElStyle(id, { customCss: nextCss }, bp);
  };
  const isCustomCssActive = (id: string, key: string, onValue: any, bp: Bp = activeStyleBp) =>
    (getStyleFor(id, bp).customCss as any)?.[key] === onValue;
  const toggleBold = (id: string, bp: Bp = activeStyleBp) => {
    const cur = getStyleFor(id, bp);
    updateElStyle(id, { fontWeight: (cur.fontWeight ?? 400) >= 600 ? 400 : 700 }, bp);
  };
  const toggleItalic = (id: string, bp: Bp = activeStyleBp) => toggleCustomCss(id, "fontStyle", "italic", bp);
  const toggleUnderline = (id: string, bp: Bp = activeStyleBp) => toggleCustomCss(id, "textDecoration", "underline", bp);
  const toggleStrikethrough = (id: string, bp: Bp = activeStyleBp) => toggleCustomCss(id, "textDecoration", "line-through", bp);
  const toggleUppercase = (id: string, bp: Bp = activeStyleBp) => toggleCustomCss(id, "textTransform", "uppercase", bp);
  const setListStyle = (id: string, kind: "disc" | "decimal" | "none", bp: Bp = activeStyleBp) => {
    const cur = getStyleFor(id, bp);
    const nextCss: Record<string, any> = { ...(cur.customCss ?? {}) };
    if (nextCss.listStyleType === kind) delete nextCss.listStyleType; else nextCss.listStyleType = kind;
    updateElStyle(id, { customCss: nextCss }, bp);
  };
  const TEXT_EFFECTS: { id: string; label: string; value?: string }[] = [
    { id: "none", label: "None" },
    { id: "soft", label: "Soft shadow", value: "0 1px 2px rgba(0,0,0,0.15)" },
    { id: "lift", label: "Lift", value: "0 4px 10px rgba(0,0,0,0.25)" },
    { id: "glow", label: "Glow", value: "0 0 12px rgba(255,255,255,0.85)" },
  ];
  const setTextEffect = (id: string, effectId: string, bp: Bp = activeStyleBp) => {
    const cur = getStyleFor(id, bp);
    const preset = TEXT_EFFECTS.find((e) => e.id === effectId);
    const nextCss: Record<string, any> = { ...(cur.customCss ?? {}) };
    if (!preset?.value) delete nextCss.textShadow; else nextCss.textShadow = preset.value;
    updateElStyle(id, { customCss: nextCss }, bp);
  };
  const activeTextEffect = (id: string, bp: Bp = activeStyleBp) => {
    const shadow = (getStyleFor(id, bp).customCss as any)?.textShadow;
    return TEXT_EFFECTS.find((e) => e.value === shadow)?.id ?? "none";
  };
  const setAlign = (id: string, value: "left" | "center" | "right" | "justify", bp: Bp = activeStyleBp) => {
    if (value === "justify") { toggleCustomCss(id, "textAlign", "justify", bp); return; }
    const nextCss = { ...(getStyleFor(id, bp).customCss ?? {}) } as Record<string, any>;
    delete nextCss.textAlign;
    updateElStyle(id, { align: value as any, customCss: nextCss }, bp);
  };

  // ===== Layer order & page alignment (Advanced tab + right-click menu) =====
  const bringToFront = (id: string, bp: Bp = activeStyleBp) => updateElStyle(id, { zIndex: Math.floor(Date.now() / 1000) % 100000 }, bp);
  const sendToBack = (id: string, bp: Bp = activeStyleBp) => updateElStyle(id, { zIndex: 0 }, bp);
  const alignOnPage = (id: string, value: "left" | "center" | "right", bp: Bp = activeStyleBp) => {
    const nextCss: Record<string, any> = { ...(getStyleFor(id, bp).customCss ?? {}) };
    if (value === "center") { nextCss.marginLeft = "auto"; nextCss.marginRight = "auto"; }
    else if (value === "left") { nextCss.marginLeft = "0"; nextCss.marginRight = "auto"; }
    else { nextCss.marginLeft = "auto"; nextCss.marginRight = "0"; }
    updateElStyle(id, { customCss: nextCss }, bp);
  };
  const selectedIds = selectedEls.map((element) => element.id);
  const selectedKey = selectedIds.join("|");
  const parsePixelValue = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return undefined;
    const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/);
    return match ? Number(match[1]) : undefined;
  };
  const readSelectedStyleValue = <K extends keyof ElementStyle>(key: K, bp: Bp = activeStyleBp) => {
    if (!selectedIds.length) return { value: undefined as ElementStyle[K] | undefined, mixed: false };
    const values = selectedIds.map((id) => getStyleFor(id, bp)[key]);
    const first = values[0];
    return {
      value: first as ElementStyle[K] | undefined,
      mixed: values.some((value) => JSON.stringify(value) !== JSON.stringify(first)),
    };
  };
  const readSelectedPixelValue = (key: "width" | "height" | "maxWidth" | "minWidth" | "minHeight", bp: Bp = activeStyleBp) => {
    const result = readSelectedStyleValue(key, bp);
    return { value: parsePixelValue(result.value), mixed: result.mixed };
  };
  const updateSelectedElementsStyle = (patch: Partial<ElementStyle>, bp: Bp = activeStyleBp) => {
    if (!selectedIds.length) return false;
    return dispatchSnapshotCommand("Update selected properties", (draft) => {
      selectedIds.forEach((id) => writeSnapStyle(draft, id, patch, bp));
      return draft;
    });
  };
  const forEachSelectedElement = (runner: (id: string) => void) => selectedIds.forEach(runner);
  const parseTranslate = (value?: string) => {
    const text = String(value ?? "");
    const match = text.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
    return {
      x: match ? Number(match[1]) : 0,
      y: match ? Number(match[2]) : 0,
      rest: text.replace(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/, "").trim(),
    };
  };
  const nudgeSelectedElements = (dx: number, dy: number) => {
    if (!selectedIds.length) return false;
    const mergeKey = `nudge:${selectedIds.join(",")}`;
    const didNudge = dispatchSnapshotCommand(
      selectedIds.length > 1 ? "Nudge elements" : "Nudge element",
      (draft) => {
        selectedIds.forEach((id) => {
          const current = (draft.theme.element_styles ?? {})[id] ?? {};
          const parsed = parseTranslate(current.transform);
          const transform = (`translate(${Math.round(parsed.x + dx)}px, ${Math.round(parsed.y + dy)}px) ${parsed.rest}`).trim();
          writeSnapStyle(draft, id, { position: "relative", transform }, "desktop");
        });
        return draft;
      },
      mergeKey,
    );
    if (didNudge) {
      setSelectedRects((current) => {
        const next = { ...current };
        selectedIds.forEach((id) => {
          const rect = next[id];
          if (rect) next[id] = { ...rect, x: rect.x + dx, y: rect.y + dy };
        });
        return next;
      });
      setSelectedRect((current) => current ? { ...current, x: current.x + dx, y: current.y + dy } : current);
    }
    return didNudge;
  };
  const bringSelectedToFront = () => forEachSelectedElement((id) => bringToFront(id));
  const sendSelectedToBack = () => forEachSelectedElement((id) => sendToBack(id));
  const setSelectedElementsLock = (locked: boolean) =>
    dispatchSnapshotCommand(locked ? "Lock selected elements" : "Unlock selected elements", (draft) => {
      const next = { ...(draft.theme.element_locks ?? {}) };
      selectedIds.forEach((id) => {
        if (locked) next[id] = true;
        else delete next[id];
      });
      draft.theme.element_locks = next;
      return draft;
    });
  const hideSelectedElements = () => deleteElements(selectedIds);

  // ===== Replace image for selected element (banner) =====
  const replaceImageRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);
  const requestReplaceImage = (id: string) => {
    replaceTargetRef.current = id;
    replaceImageRef.current?.click();
  };
  const handleReplaceFile = async (file: File) => {
    if (!user) return;
    try {
      const url = await uploadImage("store-banners", user.id, file);
      const target = replaceTargetRef.current;
      if (target === "hero-banner" || target?.startsWith("banner-")) {
        if (form.banners.length > 0) {
          const idx = target?.startsWith("banner-") ? Number(target.slice(7)) || 0 : 0;
          setForm((f) => ({ ...f, banners: f.banners.map((b, i) => (i === idx ? url : b)) }));
        } else {
          setForm((f) => ({ ...f, store_banner_url: url }));
        }
      } else if (target?.startsWith("overlay-")) {
        const id = target.slice(8);
        setTheme((th) => ({ ...th, overlays: th.overlays.map((o) => (o.id === id ? { ...o, url } : o)) }));
      } else if (target?.startsWith("cblock-")) {
        const id = target.slice("cblock-".length);
        setTheme((th) => ({
          ...th,
          custom_blocks: (th.custom_blocks ?? []).map((b) => b.id === id ? { ...b, props: { ...b.props, src: url } } : b),
        }));
      } else if (target) {
        setTheme((th) => ({
          ...th,
          element_media: {
            ...(th.element_media ?? {}),
            [target]: { ...((th.element_media ?? {})[target] ?? {}), src: url },
          },
        }));
      } else {
        setForm((f) => ({ ...f, store_banner_url: url }));
      }
      toast({ title: "Image replaced" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
  };

  // ===== Banner text overlay helpers =====
  const addTextOverlay = () => {
    const to: TextOverlay = {
      id: crypto.randomUUID(),
      text: "Your text here",
      x: 50, y: 50,
      color: "#FFFFFF", fontSize: 32, fontWeight: 700, shadow: true,
    };
    setTheme((th) => ({ ...th, text_overlays: [...th.text_overlays, to] }));
  };
  const updateTextOverlay = (id: string, patch: Partial<TextOverlay>) =>
    setTheme((th) => ({ ...th, text_overlays: th.text_overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  const removeTextOverlay = (id: string) =>
    setTheme((th) => ({ ...th, text_overlays: th.text_overlays.filter((o) => o.id !== id) }));

  const save = async () => {
    const nextForm = {
      ...form,
      business_name: form.business_name.trim() || fallbackBusinessName(user),
      store_slug: form.store_slug || await buildUniqueStoreSlug(form.business_name || fallbackBusinessName(user), user?.id),
    };
    if (nextForm.business_name !== form.business_name || nextForm.store_slug !== form.store_slug) setForm(nextForm);
    const parsed = profileSchema.safeParse(nextForm);
    if (!parsed.success) {
      toast({ title: "Check your details", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setSaving(true);
    const nameChanged = originalName && nextForm.business_name !== originalName;
    if (nameChanged && nameChangesLeft <= 0) {
      setSaving(false);
      toast({ title: "Name is locked", description: "You've used all 3 name changes.", variant: "destructive" });
      return;
    }
    const themeToSave = flushLiveStyleUpdates(theme) ?? theme;
    const update: any = {
      business_name: nextForm.business_name,
      store_slug: nextForm.store_slug,
      store_tagline: nextForm.store_tagline || null,
      store_about: nextForm.store_about || null,
      store_color: nextForm.store_color,
      store_banner_url: nextForm.store_banner_url || null,
      store_template: nextForm.store_template,
      banners: nextForm.banners as any,
      special_sections: nextForm.special_sections as any,
      theme: themeToSave as any,
    };
    if (nameChanged) {
      const used = 3 - nameChangesLeft + 1;
      update.name_change_count = used;
    }
    const { error } = await supabase.from("profiles").update(update).eq("id", user!.id);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    if (nameChanged) {
      setNameChangesLeft((n) => Math.max(0, n - 1));
      setOriginalName(nextForm.business_name);
    }
    setSlugLocked(true);
    toast({ title: "Saved", description: nameChanged ? `Name updated · ${Math.max(0, nameChangesLeft - 1)} changes left` : "Your storefront is live." });
  };

  const resetTheme = () => {
    setTheme({ ...DEFAULT_THEME, accent: form.store_color });
    toast({ title: "Theme reset" });
  };

  // ===== AI: Magic Style + Rewrite Copy =====
  const callAI = async (mode: "style" | "copy") => {
    setAiLoading(mode);
    try {
      const { data, error } = await supabase.functions.invoke("enhance-store", {
        body: {
          mode,
          store: {
            business_name: form.business_name,
            store_tagline: form.store_tagline,
            store_about: form.store_about,
            categories: Array.from(new Set(items.map((i) => i.category).filter(Boolean))),
            products: items.slice(0, 8),
          },
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const r = (data as any).result;
      if (mode === "style") {
        setForm((f) => ({ ...f, store_color: r.accent }));
        setTheme((th) => ({
          ...th,
          accent: r.accent, bg: r.bg, surface: r.surface, text: r.text,
          font: r.font, radius: Math.round(r.radius), density: r.density,
        }));
        toast({ title: "✨ Magic Style applied", description: r.rationale });
      } else {
        setTheme((th) => ({ ...th, text_overrides: { ...th.text_overrides, ...r } }));
        toast({ title: "✨ Copy rewritten", description: "All labels updated to match your brand." });
      }
    } catch (e: any) {
      toast({ title: "AI couldn't help right now", description: e.message ?? "Try again", variant: "destructive" });
    } finally {
      setAiLoading(null);
    }
  };

  // ===== AI: One-prompt "edit anything" =====
  const runAI = async () => {
    const instruction = aiPrompt.trim();
    if (!instruction) return;
    setAiLoading("any");
    try {
      const { data, error } = await supabase.functions.invoke("store-ai-edit", {
        body: {
          instruction,
          theme,
          store: {
            business_name: form.business_name,
            store_tagline: form.store_tagline,
            store_about: form.store_about,
            store_template: form.store_template,
          },
          elements: knownElements,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const p = (data as any).patch as any;
      setTheme((th) => {
        const next = { ...th };
        for (const k of ["accent", "bg", "surface", "text", "font", "radius", "density"] as const) {
          if (p[k] !== undefined) (next as any)[k] = p[k];
        }
        if (p.sections) next.sections = { ...th.sections, ...p.sections };
        if (p.text_overrides) next.text_overrides = { ...th.text_overrides, ...p.text_overrides };
        if (p.element_styles) {
          const merged = { ...th.element_styles };
          for (const id of Object.keys(p.element_styles)) {
            merged[id] = { ...(merged[id] ?? {}), ...p.element_styles[id] };
          }
          next.element_styles = merged;
        }
        return next;
      });
      if (p.accent) setForm((f) => ({ ...f, store_color: p.accent }));
      setAiPrompt("");
      toast({ title: "✨ AI applied", description: p.rationale || "Storefront updated." });
    } catch (e: any) {
      toast({ title: "AI couldn't help", description: e.message ?? "Try again", variant: "destructive" });
    } finally {
      setAiLoading(null);
    }
  };

  // ===== Add overlay image =====
  const addOverlay = async (file: File | null, url: string | null, section: SectionKey) => {
    if (!user) return;
    let finalUrl = url;
    if (file) {
      try { finalUrl = await uploadImage("store-banners", user.id, file); }
      catch (e: any) { toast({ title: "Upload failed", description: e.message, variant: "destructive" }); return; }
    }
    if (!finalUrl) return;
    const ov: OverlayImage = {
      id: crypto.randomUUID(),
      url: finalUrl, section,
      x: 10, y: 10, w: 25, z: 5,
      radius: 0, shadow: "md",
    };
    setTheme((th) => ({ ...th, overlays: [...th.overlays, ov] }));
    toast({ title: "Image added", description: "Drag it in the preview to reposition." });
  };

  // ===== Theme presets =====
  const applyPreset = (preset: typeof THEME_PRESETS[number]) => {
    setTheme((th) => ({ ...th, ...preset.theme, text_overrides: { ...th.text_overrides, ...(preset.theme.text_overrides ?? {}) } }));
    if (preset.theme.accent) setForm((f) => ({ ...f, store_color: preset.theme.accent! }));
    if (preset.template) setForm((f) => ({ ...f, store_template: preset.template! as StoreTemplate }));
    toast({ title: `${preset.name} applied`, description: "Tweak any colors, fonts, or copy." });
  };

  // ===== Banners (multiple, scrollable) =====
  const addBanner = async (file: File | null, url: string | null) => {
    if (!user) return;
    let finalUrl = url;
    if (file) {
      try { finalUrl = await uploadImage("store-banners", user.id, file); }
      catch (e: any) { toast({ title: "Upload failed", description: e.message, variant: "destructive" }); return; }
    }
    if (!finalUrl) return;
    setForm((f) => ({ ...f, banners: [...f.banners, finalUrl!] }));
    toast({ title: "Banner added" });
  };
  const removeBanner = (i: number) => setForm((f) => ({ ...f, banners: f.banners.filter((_, idx) => idx !== i) }));
  const moveBanner = (i: number, dir: -1 | 1) => {
    setForm((f) => {
      const next = [...f.banners];
      const j = i + dir;
      if (j < 0 || j >= next.length) return f;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...f, banners: next };
    });
  };

  // ===== Special sections =====
  const addSpecialSection = () => {
    const sec: SpecialSectionItem = {
      id: crypto.randomUUID(),
      title: "New section",
      subtitle: "",
      productIds: [],
      badges: [],
    };
    setForm((f) => ({ ...f, special_sections: [...f.special_sections, sec] }));
  };
  const updateSpecialSection = (id: string, patch: Partial<SpecialSectionItem>) =>
    setForm((f) => ({ ...f, special_sections: f.special_sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const removeSpecialSection = (id: string) =>
    setForm((f) => ({ ...f, special_sections: f.special_sections.filter((s) => s.id !== id) }));

  const storeUrl = useMemo(
    () => (form.store_slug ? `${window.location.origin}/store/${form.store_slug}` : ""),
    [form.store_slug],
  );
  const previewUrl = useMemo(
    () => (form.store_slug ? `${window.location.origin}/store/${form.store_slug}?edit=1&preview=${previewKey}` : ""),
    [form.store_slug, previewKey],
  );
  const copyUrl = () => { navigator.clipboard.writeText(storeUrl); toast({ title: "Link copied" }); };

  const setTextOverride = (k: keyof StoreTheme["text_overrides"], v: string) =>
    setTheme({ ...theme, text_overrides: { ...theme.text_overrides, [k]: v } });
  const toggleSection = (k: SectionKey) =>
    setTheme({ ...theme, sections: { ...theme.sections, [k]: !theme.sections[k] } });

  const TAB_ITEMS: { id: string; label: string; icon: any }[] = [
    { id: "presets", label: "Presets", icon: Star },
    { id: "branding", label: "Brand", icon: Type },
    { id: "design", label: "Design", icon: Palette },
    { id: "layout", label: "Layout", icon: Layout },
    { id: "sections", label: "Sections", icon: LayoutGrid },
    { id: "text", label: "Text", icon: Sparkles },
    { id: "images", label: "Images", icon: ImgIcon },
    { id: "template", label: "Style", icon: Check },
  ];
  const activeLabel = TAB_ITEMS.find((t) => t.id === activeTab)?.label ?? "";

  /** Opens a right-panel settings tab and makes sure the element inspector gets out of the way. */
  const openRightTab = (tab: string) => {
    clearSelection();
    setActiveTab(tab);
  };
  const focusAI = () => {
    aiInputRef.current?.focus();
    aiInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // ===== Canvas tools: fit to screen + drag-to-pan =====
  const fitToScreen = () => {
    const avail = canvasScrollRef.current?.clientWidth ?? 0;
    if (!avail) return;
    const next = Math.min(150, Math.max(25, Math.round(((avail - 48) / previewW) * 100)));
    setZoom(next);
  };
  const panMouseDown = (e: ReactMouseEvent) => {
    if (canvasTool !== "pan") return;
    const el = canvasScrollRef.current;
    if (!el) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const startLeft = el.scrollLeft, startTop = el.scrollTop;
    const onMove = (ev: MouseEvent) => {
      el.scrollLeft = startLeft - (ev.clientX - startX);
      el.scrollTop = startTop - (ev.clientY - startY);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const IconBtn = ({ tip, onClick, active, disabled, children }: any) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onClick} disabled={disabled}
          className={`h-8 w-8 grid place-items-center rounded-md transition-colors ${active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"} disabled:opacity-40 disabled:cursor-not-allowed`}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">{tip}</TooltipContent>
    </Tooltip>
  );

  const paletteCommands: PaletteCommand[] = useMemo(() => {
    const cmds: PaletteCommand[] = [];
    cmds.push(
      { id: "undo", group: "Edit", label: "Undo", hint: "⌘Z", icon: Undo2, disabled: !canUndo, run: undo },
      { id: "redo", group: "Edit", label: "Redo", hint: "⇧⌘Z", icon: Redo2, disabled: !canRedo, run: redo },
      { id: "copy-selection", group: "Edit", label: "Copy selection", hint: "⌘C", icon: Copy, disabled: !selectedIds.length, run: () => copyElements() },
      { id: "cut-selection", group: "Edit", label: "Cut selection", hint: "⌘X", icon: XIcon, disabled: !selectedIds.length, run: () => cutElements() },
      { id: "paste-selection", group: "Edit", label: "Paste", hint: "⌘V", icon: ClipboardPaste, disabled: !hasClipboard, run: () => pasteElement() },
      { id: "duplicate-selection", group: "Edit", label: "Duplicate selection", hint: "⌘D", icon: Layers, disabled: !selectedIds.length, run: () => duplicateElements() },
      { id: "delete-selection", group: "Edit", label: "Delete selection", hint: "Del", icon: Trash2, disabled: !selectedIds.length, run: () => deleteElements() },
      { id: "restore", group: "Edit", label: "Restore last saved", icon: RotateCcw, run: restore },
      { id: "publish", group: "Edit", label: saving ? "Publishing…" : "Publish changes", icon: Save, disabled: saving, run: save },
    );
    cmds.push(
      { id: "dev-desktop", group: "View", label: "Switch to desktop", icon: Monitor, run: () => setDevice("desktop") },
      { id: "dev-tablet", group: "View", label: "Switch to tablet", icon: Tablet, run: () => setDevice("tablet") },
      { id: "dev-mobile", group: "View", label: "Switch to mobile", icon: Smartphone, run: () => setDevice("mobile") },
      { id: "reload", group: "View", label: "Reload preview", icon: RefreshCw, run: () => setPreviewKey((k) => k + 1) },
      { id: "toggle-left", group: "View", label: sidebarOpen ? "Hide insert panel" : "Show insert panel", icon: sidebarOpen ? PanelLeftClose : PanelLeftOpen, run: () => setSidebarOpen((v) => !v) },
      { id: "toggle-grid", group: "View", label: showGrid ? "Hide alignment grid" : "Show alignment grid", icon: LayoutGrid, run: () => setShowGrid((v) => !v) },
      { id: "fit-screen", group: "View", label: "Fit to screen", icon: Maximize2, run: fitToScreen },
      { id: "tool-select", group: "View", label: "Selection tool", icon: MousePointer2, run: () => setCanvasTool("select") },
      { id: "tool-pan", group: "View", label: "Pan tool", icon: Hand, run: () => setCanvasTool("pan") },
    );
    if (storeUrl) {
      cmds.push(
        { id: "copy-link", group: "View", label: "Copy live store link", icon: Share2, run: copyUrl },
        { id: "open-live", group: "View", label: "Open live storefront", icon: Play, run: () => window.open(storeUrl, "_blank") },
      );
    }
    for (const tab of TAB_ITEMS) {
      cmds.push({ id: `tab-${tab.id}`, group: "Panels", label: `Open ${tab.label} settings`, icon: tab.icon, run: () => openRightTab(tab.id) });
    }
    for (const key of theme.section_order) {
      cmds.push({
        id: `section-${key}`,
        group: "Sections",
        label: `Jump to ${SECTION_LABELS[key]}`,
        icon: theme.sections[key] ? Eye : EyeOff,
        run: () => { setActiveSection(key); broadcast({ type: "focus-section", section: key }); },
      });
      cmds.push({
        id: `toggle-section-${key}`,
        group: "Sections",
        label: `${theme.sections[key] ? "Hide" : "Show"} ${SECTION_LABELS[key]}`,
        icon: theme.sections[key] ? EyeOff : Eye,
        run: () => toggleSection(key),
      });
    }
    for (const el of knownElements.slice(0, 60)) {
      cmds.push({ id: `el-${el.id}`, group: "Elements", label: `Select ${el.label || el.id}`, icon: MousePointerClick, run: () => selectElement(el) });
    }
    for (const b of theme.custom_blocks ?? []) {
      cmds.push({
        id: `block-${b.id}`,
        group: "Elements",
        label: `Select ${b.props.text?.slice(0, 30) || b.kind} block`,
        icon: Layers,
        run: () => selectElement({ id: `cblock-${b.id}`, label: "Block" }),
      });
    }
    for (const preset of THEME_PRESETS) {
      cmds.push({ id: `preset-${preset.id}`, group: "Presets", label: `Apply "${preset.name}" preset`, icon: Star, run: () => applyPreset(preset) });
    }
    cmds.push({ id: "reset-theme", group: "Presets", label: "Reset theme to default", icon: RotateCcw, run: resetTheme });
    return cmds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUndo, canRedo, saving, sidebarOpen, storeUrl, theme.section_order, theme.sections, theme.custom_blocks, knownElements, activeTab, showGrid, selectedKey, hasClipboard]);

  const selectionContext = useMemo(() => {
    if (!selectedEl) return null;
    const block = selectedEl.id.startsWith("cblock-")
      ? (theme.custom_blocks ?? []).find((candidate) => candidate.id === selectedEl.id.slice("cblock-".length))
      : undefined;
    const kind = classifyElement({
      id: selectedEl.id,
      tag: selectedEl.tag,
      block,
      kind: selectedEl.kind,
      childCount: selectedEl.childCount,
      display: selectedEl.display,
    });
    return {
      block,
      kind,
      profile: INSPECTOR_PROFILES[kind],
      locked: !!theme.element_locks?.[selectedEl.id],
      hidden: !!theme.element_styles?.[selectedEl.id]?.hidden,
    };
  }, [selectedEl, theme.custom_blocks, theme.element_locks, theme.element_styles]);

  if (loading) return <div className="text-muted-foreground">Loading…</div>;

  const scale = zoom / 100;
  const iframeScreenRect = () => iframeRef.current?.getBoundingClientRect() ?? null;
  /** Converts a point/rect in the iframe's own (unscaled) coordinate space to fixed viewport coords. */
  const toFixed = (localX: number, localY: number) => {
    const r = iframeScreenRect();
    if (!r) return null;
    return { x: r.left + localX * scale, y: r.top + localY * scale };
  };
  const selectedBlock = selectionContext?.block;
  const selectedKind = selectionContext?.kind ?? null;
  const showsTextTools = selectedEls.length === 1 && selectedKind ? supportsInspectorFeature(selectedKind, "text") : false;
  const anchorTop = selectedEl && selectedRect ? toFixed(selectedRect.x + selectedRect.width / 2, selectedRect.y) : null;
  const anchorBottom = selectedEl && selectedRect ? toFixed(selectedRect.x, selectedRect.y + selectedRect.height) : null;
  const multiSelectionRect = selectedEls.length > 1
    ? selectedIds
        .map((id) => selectedRects[id])
        .filter(Boolean)
        .reduce<{ x: number; y: number; width: number; height: number } | null>((bounds, rect) => {
          if (!bounds) return rect;
          const x = Math.min(bounds.x, rect.x);
          const y = Math.min(bounds.y, rect.y);
          const right = Math.max(bounds.x + bounds.width, rect.x + rect.width);
          const bottom = Math.max(bounds.y + bounds.height, rect.y + rect.height);
          return { x, y, width: right - x, height: bottom - y };
        }, null)
    : null;
  const multiAnchorBottom = multiSelectionRect ? toFixed(multiSelectionRect.x, multiSelectionRect.y + multiSelectionRect.height) : null;

  return (
    <>
    <div className="sb-editor-shell flex h-screen min-h-0 flex-col overflow-hidden">
      {/* ============ TOP TOOLBAR ============ */}
      <header className="hidden">
        <Button asChild variant="ghost" size="sm" className="h-9 shrink-0 gap-1.5 px-2 text-xs">
          <Link to="/dashboard">
            <ArrowLeft size={14} />
            Back
          </Link>
        </Button>
        <div className="h-7 w-px bg-border" />
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-md grid place-items-center text-background shrink-0" style={{ background: form.store_color }}>
            <Store size={15} />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Storeblink editor</div>
            <div className="text-sm font-semibold truncate flex items-center gap-1">
              <span className="truncate max-w-[140px]">{form.business_name || "My store"}</span>
            </div>
          </div>
        </div>

        {/* Home page selector + quick add */}
        <SimpleDropdown
          trigger={({ toggle, open }) => (
            <button onClick={toggle} className={`h-8 flex items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted ${open ? "bg-muted" : ""}`}>
              <FileText size={12} /> Home page <ChevronDown size={12} className="text-muted-foreground" />
            </button>
          )}
        >
          {(close) => (
            <>
              <DropdownRow icon={Check} label="Home" hint="Live" onClick={close} />
              <MenuDivider />
              <DropdownRow icon={Plus} label="Add page" hint="Coming soon" disabled />
            </>
          )}
        </SimpleDropdown>

        <SimpleDropdown
          trigger={({ toggle }) => (
            <button onClick={toggle} className="h-8 flex items-center gap-1.5 rounded-md bg-foreground text-background px-2.5 text-xs font-medium hover:opacity-90">
              <Plus size={12} /> Add
            </button>
          )}
        >
          {(close) => (
            <>
              {INSERT_ITEMS.filter((i) => i.kind !== "hero-text" && i.kind !== "overlay-image").map((item) => (
                <DropdownRow
                  key={item.kind}
                  icon={item.icon}
                  label={item.label}
                  onClick={() => { addCustomBlock(item.kind as any, activeSection ?? theme.section_order[0]); close(); }}
                />
              ))}
              <MenuDivider />
              <DropdownRow icon={Type} label="Hero text" onClick={() => { addCustomBlock; setTheme((th) => ({ ...th, text_overlays: [...th.text_overlays, { id: crypto.randomUUID(), text: "New text", x: 50, y: 50, color: "#FFFFFF", fontSize: 32, fontWeight: 700, shadow: true } as TextOverlay] })); close(); }} />
            </>
          )}
        </SimpleDropdown>

        <div className="flex-1 flex items-center justify-center gap-2">
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={undo} disabled={!canUndo}><Undo2 size={14} /></Button></TooltipTrigger><TooltipContent className="text-xs">Undo (⌘Z)</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={redo} disabled={!canRedo}><Redo2 size={14} /></Button></TooltipTrigger><TooltipContent className="text-xs">Redo (⇧⌘Z)</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={restore}><RotateCcw size={14} /></Button></TooltipTrigger><TooltipContent className="text-xs">Restore last saved</TooltipContent></Tooltip>

          <div className="mx-1 h-6 w-px bg-border" />

          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
            {[
              { id: "mobile", icon: Smartphone, tip: "Mobile · 375px" },
              { id: "tablet", icon: Tablet, tip: "Tablet · 768px" },
              { id: "desktop", icon: Monitor, tip: "Desktop · 1280px" },
            ].map((d) => (
              <Tooltip key={d.id}>
                <TooltipTrigger asChild>
                  <button onClick={() => setDevice(d.id as any)}
                    className={`h-7 w-8 grid place-items-center rounded transition-colors ${device === d.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    <d.icon size={13} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">{d.tip}</TooltipContent>
              </Tooltip>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-muted rounded-md px-2 py-1">
            <input type="number" value={previewW} min={240} max={3000}
              onChange={(e) => { setPreviewW(Math.max(240, Number(e.target.value) || 0)); setDevice("custom"); }}
              className="w-14 bg-transparent text-xs font-mono text-center outline-none tabular-nums" />
            <span className="text-[10px] text-muted-foreground">×</span>
            <input type="number" value={previewH} min={240} max={5000}
              onChange={(e) => { setPreviewH(Math.max(240, Number(e.target.value) || 0)); setDevice("custom"); }}
              className="w-14 bg-transparent text-xs font-mono text-center outline-none tabular-nums" />
            <span className="text-[10px] text-muted-foreground">px</span>
          </div>

          <div className="flex items-center gap-1 bg-muted rounded-md px-2 py-1">
            <button onClick={() => setZoom((z) => Math.max(25, z - 10))} className="text-muted-foreground hover:text-foreground text-xs px-1">−</button>
            <span className="text-xs font-mono w-9 text-center">{zoom}%</span>
            <button onClick={() => setZoom((z) => Math.min(150, z + 10))} className="text-muted-foreground hover:text-foreground text-xs px-1">+</button>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="ghost" onClick={() => setPreviewKey((k) => k + 1)} className="h-8 w-8 p-0">
                <RefreshCw size={13} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Reload preview</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setPaletteOpen(true)}
                className="h-8 flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Search size={12} />
                <span className="hidden lg:inline text-xs">Search</span>
                <kbd className="hidden lg:flex items-center gap-0.5 text-[9px] border border-border rounded px-1 py-0.5 bg-background"><Command size={9} />K</kbd>
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Command palette (⌘K)</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="hidden 2xl:flex sb-editor-command h-9 w-[380px] items-center gap-2 rounded-lg px-2">
            <Sparkles size={13} className="text-[color:var(--editor-blue)]" />
            <Input
              ref={aiInputRef}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runAI(); } }}
              placeholder="Ask AI to change the store"
              disabled={aiLoading === "any"}
              className="h-7 flex-1 border-0 bg-transparent px-0 text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <button
              type="button"
              onClick={runAI}
              disabled={aiLoading === "any" || !aiPrompt.trim()}
              className="h-6 rounded bg-primary px-2 text-[11px] font-semibold text-primary-foreground disabled:opacity-40"
            >
              {aiLoading === "any" ? "..." : "Apply"}
            </button>
          </div>
          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={() => callAI("style")} disabled={!!aiLoading} className="h-8 gap-1.5">
              <Wand2 size={13} /> <span className="hidden xl:inline text-xs">{aiLoading === "style" ? "Styling…" : "Magic"}</span>
            </Button>
          </TooltipTrigger><TooltipContent className="text-xs">AI: pick a whole theme for your store</TooltipContent></Tooltip>

          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={() => callAI("copy")} disabled={!!aiLoading} className="h-8 gap-1.5">
              <Sparkles size={13} /> <span className="hidden xl:inline text-xs">{aiLoading === "copy" ? "Writing…" : "Rewrite"}</span>
            </Button>
          </TooltipTrigger><TooltipContent className="text-xs">AI: rewrite all storefront copy</TooltipContent></Tooltip>

          <div className="mx-1 h-6 w-px bg-border" />

          {form.store_slug && (
            <>
              <Tooltip><TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={copyUrl} className="h-8 gap-1.5">
                  <Share2 size={13} /><span className="hidden md:inline text-xs">Share</span>
                </Button>
              </TooltipTrigger><TooltipContent className="text-xs">Copy live store link</TooltipContent></Tooltip>

              <Tooltip><TooltipTrigger asChild>
                <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
                  <a href={storeUrl} target="_blank" rel="noreferrer"><Play size={12} /><span className="hidden md:inline text-xs">Preview</span></a>
                </Button>
              </TooltipTrigger><TooltipContent className="text-xs">Open live storefront</TooltipContent></Tooltip>
            </>
          )}

          <div className="text-[10px] tabular-nums px-1.5 min-w-[52px] text-center rounded"
            style={{
              color: saveState === "error" ? "hsl(0 70% 50%)" : saveState === "saving" || saveState === "dirty" ? "hsl(var(--muted-foreground))" : "hsl(142 60% 40%)",
            }}>
            {saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved" : saveState === "saved" ? "✓ Saved" : saveState === "error" ? "Save failed" : "All saved"}
          </div>

          <div className="flex items-center rounded-md overflow-hidden">
            <Button onClick={save} disabled={saving} size="sm" className="h-8 gap-1.5 rounded-r-none border-b-2 border-black bg-[#ccf81e] hover:bg-[#D0FE1D] text-black/65">
              <Save size={13} /> {saving ? "Saving…" : "Publish"}
            </Button>
            <SimpleDropdown
              align="right"
              width={200}
              trigger={({ toggle }) => (
                <button onClick={toggle} className="h-8 px-1.5 grid place-items-center bg-primary hover:bg-primary/90 text-primary-foreground border-l border-white/20">
                  <ChevronDown size={13} />
                </button>
              )}
            >
              {(close) => (
                <>
                  <DropdownRow icon={Save} label="Publish now" onClick={() => { save(); close(); }} />
                  {form.store_slug && <DropdownRow icon={Share2} label="Copy live link" onClick={() => { copyUrl(); close(); }} />}
                  {form.store_slug && <DropdownRow icon={Play} label="View live site" onClick={() => { window.open(storeUrl, "_blank"); close(); }} />}
                </>
              )}
            </SimpleDropdown>
          </div>

          <SimpleDropdown
            align="right"
            trigger={({ toggle }) => (
              <button onClick={toggle} className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                <MoreHorizontal size={15} />
              </button>
            )}
          >
            {(close) => (
              <>
                <DropdownRow icon={RotateCcw} label="Restore last saved" onClick={() => { restore(); close(); }} />
                <DropdownRow icon={RotateCcw} label="Reset theme to default" onClick={() => { resetTheme(); close(); }} />
                <MenuDivider />
                <DropdownRow icon={Command} label="Command palette" hint="⌘K" onClick={() => { setPaletteOpen(true); close(); }} />
                <DropdownRow icon={HelpCircle} label="Keyboard shortcuts" onClick={() => { setShowHelp(true); close(); }} />
              </>
            )}
          </SimpleDropdown>
        </div>

        <input ref={replaceImageRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReplaceFile(f); e.target.value = ""; }} />
      </header>

      {/* ============ BODY ============ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ============ LEFT INSERT SIDEBAR ============ */}
        <BlocksSidebar
          open={sidebarOpen}
          width={leftWidth}
          onToggle={() => setSidebarOpen((v) => !v)}
          sectionOrder={theme.section_order}
          sections={theme.sections}
          activeSection={activeSection}
          onReorderSections={(section_order) => setTheme((th) => ({ ...th, section_order }))}
          onToggleSection={toggleSection}
          onFocusSection={(section) => {
            setActiveSection(section);
            broadcast({ type: "focus-section", section });
          }}
          onAddHeroText={() => {
            const to: TextOverlay = {
              id: crypto.randomUUID(),
              text: "New text",
              x: 50, y: 50,
              color: "#FFFFFF",
              fontSize: 32, fontWeight: 700, shadow: true,
            };
            setTheme((th) => ({ ...th, text_overlays: [...th.text_overlays, to] }));
            toast({ title: "Text added to hero", description: "Drag it in the preview to position." });
          }}
          onAddOverlayImage={(section) => {
            const inp = document.createElement("input");
            inp.type = "file"; inp.accept = "image/*";
            inp.onchange = () => { const f = inp.files?.[0]; if (f) addOverlay(f, null, section); };
            inp.click();
          }}
          onAddBlock={(kind, section) => {
            if (kind === "image") {
              const inp = document.createElement("input");
              inp.type = "file"; inp.accept = "image/*";
              inp.onchange = async () => {
                const f = inp.files?.[0];
                if (!f || !user) { addCustomBlock("image", section); return; }
                try {
                  const url = await uploadImage("store-banners", user.id, f);
                  addCustomBlock("image", section, { src: url });
                } catch { addCustomBlock("image", section); }
              };
              inp.click();
            } else {
              addCustomBlock(kind, section);
            }
          }}
          existingBlocks={theme.custom_blocks ?? []}
          existingOverlays={theme.overlays}
          existingHeroTexts={theme.text_overlays}
          onSelectBlock={(bid) => selectElement({ id: `cblock-${bid}`, label: "Block" })}
          editableElements={knownElements}
          onSelectElement={(el) => selectElement(el)}
          onOpenRightTab={openRightTab}
          onFocusAI={focusAI}
          showHelp={showHelp}
          onToggleHelp={() => setShowHelp((v) => !v)}
          storeName={form.business_name || "Storeblink Editor"}
          currentTemplate={form.store_template}
          storeColor={form.store_color}
          onSelectTemplate={(store_template) => setForm((f) => ({ ...f, store_template }))}
        />
        {sidebarOpen && (
          <div
            onMouseDown={startResize("left")}
            className={`w-1 shrink-0 cursor-col-resize hover:bg-primary/70 transition-colors ${resizing === "left" ? "bg-primary/70" : "bg-transparent"}`}
            title="Drag to resize"
          />
        )}

        {/* ============ PREVIEW CANVAS ============ */}
        <main className="flex-1 flex flex-col overflow-hidden relative">

          <div className="h-9 shrink-0 border-b border-border bg-background/80 flex items-center px-3 gap-2 text-xs">
            <div className="flex gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
            </div>
            <span className="text-muted-foreground font-mono ml-2 truncate flex-1">
              {form.store_slug ? `${window.location.host}/store/${form.store_slug}` : "Save store URL to preview"}
            </span>
            <span className="text-muted-foreground font-mono tabular-nums">{previewW} × {previewH}</span>
          </div>

          <div
            ref={canvasScrollRef}
            onMouseDown={panMouseDown}
            className={`sb-editor-canvas-bg flex-1 overflow-auto p-8 ${canvasTool === "pan" ? "cursor-grab active:cursor-grabbing" : ""}`}
          >
            {form.store_slug ? (
              (() => {
                return (
                  <div className="mx-auto" style={{ width: previewW * scale, height: previewH * scale }}>
                    <div className="sb-editor-preview-frame overflow-hidden relative" style={{ width: previewW * scale, height: previewH * scale }}>
                      <iframe
                        ref={iframeRef}
                        key={previewKey}
                        src={previewUrl}
                        title="Store preview"
                        className="border-0 bg-background block"
                        style={{ width: previewW, height: previewH, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: canvasTool === "pan" ? "none" : "auto" }}
                      />
                      {showGrid && (
                        <div
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            backgroundImage: "repeating-linear-gradient(to right, hsla(280,80%,55%,0.35) 0, hsla(280,80%,55%,0.35) 1px, transparent 1px, transparent calc(100%/12))",
                          }}
                        />
                      )}
                    </div>
                    {/* Resize handles */}
                    <div
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const startX = e.clientX, startW = previewW;
                        const onMove = (ev: MouseEvent) => { setPreviewW(Math.max(240, Math.round(startW + (ev.clientX - startX) / scale))); setDevice("custom"); };
                        const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                        window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
                      }}
                      className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-16 bg-foreground/70 hover:bg-foreground rounded-l cursor-ew-resize"
                      style={{ transform: `translate(0,-50%)`, marginRight: -4 }}
                      title="Drag to resize width"
                    />
                    <div
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const startY = e.clientY, startH = previewH;
                        const onMove = (ev: MouseEvent) => { setPreviewH(Math.max(240, Math.round(startH + (ev.clientY - startY) / scale))); setDevice("custom"); };
                        const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                        window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
                      }}
                      className="absolute left-1/2 bottom-0 -translate-x-1/2 w-16 h-2 bg-foreground/70 hover:bg-foreground rounded-t cursor-ns-resize"
                      style={{ marginBottom: -4 }}
                      title="Drag to resize height"
                    />
                  </div>
                );
              })()
            ) : (
              <div className="h-full grid place-items-center text-center p-8">
                <div>
                  <Store className="mx-auto mb-3 text-muted-foreground" size={36} />
                  <div className="text-sm font-medium">Set a store URL to see the live editor</div>
                </div>
              </div>
            )}
          </div>

          <div className="h-8 shrink-0 hidden border-t border-border bg-background/85 px-3 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {selectedEls.length > 1
                ? `${selectedEls.length} selected · drag any selected element to move the group · Shift-click to add/remove`
                : "Click any text to edit · Shift-click multi-select · drag empty canvas for marquee · drag selected elements to move"}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild size="sm" variant="ghost" className="h-6 text-[11px] gap-1">
                  <Link to="/dashboard/items"><LayoutGrid size={11} />Manage products</Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Go to your product catalog</TooltipContent>
            </Tooltip>
          </div>

          {/* ============ BOTTOM FLOATING CANVAS TOOLBAR ============ */}
          {form.store_slug && (
            <div className="sb-editor-floating absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-xl border px-1.5 py-1.5">
              <IconBtn tip="Select tool (V)" active={canvasTool === "select"} onClick={() => setCanvasTool("select")}>
                <MousePointer2 size={14} />
              </IconBtn>
              <IconBtn tip="Pan tool — drag to scroll (H)" active={canvasTool === "pan"} onClick={() => setCanvasTool("pan")}>
                <Hand size={14} />
              </IconBtn>
              <IconBtn tip={showGrid ? "Hide alignment grid" : "Show alignment grid"} active={showGrid} onClick={() => setShowGrid((v) => !v)}>
                <LayoutGrid size={14} />
              </IconBtn>
              <IconBtn tip="Fit to screen" onClick={fitToScreen}>
                <Maximize2 size={14} />
              </IconBtn>
              <div className="mx-0.5 h-5 w-px bg-border" />
              <button onClick={() => setZoom((z) => Math.max(25, z - 10))} className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground text-sm">−</button>
              <span className="text-xs font-mono w-10 text-center tabular-nums">{zoom}%</span>
              <button onClick={() => setZoom((z) => Math.min(150, z + 10))} className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground text-sm">+</button>
              <div className="mx-0.5 h-5 w-px bg-border" />
              <IconBtn tip="Undo (⌘Z)" onClick={undo} disabled={!canUndo}><Undo2 size={14} /></IconBtn>
              <IconBtn tip="Redo (⇧⌘Z)" onClick={redo} disabled={!canRedo}><Redo2 size={14} /></IconBtn>
            </div>
          )}

          {/* ============ FLOATING TEXT-FORMAT TOOLBAR (Canva-style) ============ */}
          {showsTextTools && selectedEl && (
            <RichTextQuickBar
              fixedAnchor={anchorTop}
              tag={selectedEl.tag}
              style={getStyleFor(selectedEl.id, activeStyleBp)}
              onToggleBold={() => toggleBold(selectedEl.id)}
              onToggleItalic={() => toggleItalic(selectedEl.id)}
              onToggleUnderline={() => toggleUnderline(selectedEl.id)}
              onToggleStrike={() => toggleStrikethrough(selectedEl.id)}
              onToggleUppercase={() => toggleUppercase(selectedEl.id)}
              onSetAlign={(v) => setAlign(selectedEl.id, v)}
              onSetList={(k) => setListStyle(selectedEl.id, k)}
              onSetFontSize={(v) => updateElStyle(selectedEl.id, { fontSize: v })}
              onSetFontFamily={(v) => updateElStyle(selectedEl.id, { fontFamily: v })}
              onSetColor={(v) => updateElStyle(selectedEl.id, { color: v })}
              effectId={activeTextEffect(selectedEl.id)}
              onSetEffect={(id) => setTextEffect(selectedEl.id, id)}
              effects={TEXT_EFFECTS}
              isActive={(key, val) => isCustomCssActive(selectedEl.id, key, val)}
            />
          )}

          {/* ============ FLOATING ELEMENT QUICK-ACTIONS TOOLBAR ============ */}
          {selectedEls.length > 1 && (
            <div
              style={multiAnchorBottom ? { position: "fixed", left: multiAnchorBottom.x, top: multiAnchorBottom.y + 8, zIndex: 55 } : { position: "relative" }}
              className="sb-editor-floating flex items-center gap-1 rounded-lg border px-2 py-1"
            >
              <span className="px-2 text-xs font-semibold text-primary">{selectedEls.length} selected</span>
              <div className="mx-0.5 h-5 w-px bg-border" />
              <button onClick={bringSelectedToFront} className="h-7 w-7 grid place-items-center rounded hover:bg-muted" title="Bring selected to front"><ArrowUpToLine size={12} /></button>
              <button onClick={sendSelectedToBack} className="h-7 w-7 grid place-items-center rounded hover:bg-muted" title="Send selected to back"><ArrowDownToLine size={12} /></button>
              <button onClick={() => copyElements()} className="h-7 w-7 grid place-items-center rounded hover:bg-muted" title="Copy selected"><Copy size={12} /></button>
              <button onClick={() => duplicateElements()} className="h-7 w-7 grid place-items-center rounded hover:bg-muted" title="Duplicate selected"><Layers size={12} /></button>
              <button onClick={() => setSelectedElementsLock(true)} className="h-7 w-7 grid place-items-center rounded hover:bg-muted" title="Lock selected"><Lock size={12} /></button>
              <button onClick={() => setSelectedElementsLock(false)} className="h-7 w-7 grid place-items-center rounded hover:bg-muted" title="Unlock selected"><Unlock size={12} /></button>
              <button onClick={hideSelectedElements} className="h-7 w-7 grid place-items-center rounded text-destructive hover:bg-destructive/10" title="Delete selected"><Trash2 size={12} /></button>
            </div>
          )}

          {selectedEls.length === 1 && selectedEl && (
            <ElementQuickToolbar
              fixedAnchor={anchorBottom}
              locked={!!theme.element_locks?.[selectedEl.id]}
              isBlock={selectedEl.id.startsWith("cblock-")}
              onDuplicate={() => duplicateElements([selectedEl.id])}
              onCopy={() => copyElement(selectedEl.id)}
              onCopyStyle={() => copyStyleOf(selectedEl.id)}
              onPasteStyle={() => pasteStyleTo(selectedEl.id)}
              onToggleLock={() => setElementLock(selectedEl.id, !theme.element_locks?.[selectedEl.id])}
              onBringFront={() => bringToFront(selectedEl.id)}
              onSendBack={() => sendToBack(selectedEl.id)}
              onDelete={() => {
                deleteElements([selectedEl.id]);
              }}
              onMore={(clientX, clientY) => setContextMenu({ id: selectedEl.id, clientX, clientY })}
            />
          )}

        </main>
        <div
          onMouseDown={startResize("right")}
          className={`w-1 shrink-0 cursor-col-resize hover:bg-primary/70 transition-colors ${resizing === "right" ? "bg-primary/70" : "bg-transparent"}`}
          title="Drag to resize"
        />
        {selectedEls.length > 1 ? (
          <aside style={{ width: rightWidth }} className="sb-editor-panel shrink-0 border-l border-border overflow-y-auto">
            <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Multi-selection</div>
                <div className="text-sm font-semibold">{selectedEls.length} elements selected</div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearSelection}>
                <XIcon size={14} />
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Shared properties</div>
                  <div className="text-xs text-muted-foreground">Mixed values show blank until you commit a new value.</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberPropertyEditor
                    label="Width"
                    value={readSelectedPixelValue("width").value}
                    mixed={readSelectedPixelValue("width").mixed}
                    min={1}
                    onCommit={(value) => updateSelectedElementsStyle({ width: `${value}px` })}
                  />
                  <NumberPropertyEditor
                    label="Height"
                    value={readSelectedPixelValue("height").value}
                    mixed={readSelectedPixelValue("height").mixed}
                    min={1}
                    onCommit={(value) => updateSelectedElementsStyle({ height: `${value}px` })}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <NumberPropertyEditor
                    label="Padding"
                    value={readSelectedStyleValue("padding").value as number | undefined}
                    mixed={readSelectedStyleValue("padding").mixed}
                    min={0}
                    max={96}
                    onCommit={(value) => updateSelectedElementsStyle({ padding: value })}
                  />
                  <NumberPropertyEditor
                    label="Margin"
                    value={readSelectedStyleValue("margin").value as number | undefined}
                    mixed={readSelectedStyleValue("margin").mixed}
                    min={0}
                    max={160}
                    onCommit={(value) => updateSelectedElementsStyle({ margin: value })}
                  />
                  <NumberPropertyEditor
                    label="Radius"
                    value={readSelectedStyleValue("radius").value as number | undefined}
                    mixed={readSelectedStyleValue("radius").mixed}
                    min={0}
                    max={80}
                    onCommit={(value) => updateSelectedElementsStyle({ radius: value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <ColorPropertyEditor
                    label="Background"
                    value={readSelectedStyleValue("bg").value as string | undefined}
                    mixed={readSelectedStyleValue("bg").mixed}
                    fallback="#ffffff"
                    onCommit={(value) => updateSelectedElementsStyle({ bg: value })}
                  />
                  <ColorPropertyEditor
                    label="Text"
                    value={readSelectedStyleValue("color").value as string | undefined}
                    mixed={readSelectedStyleValue("color").mixed}
                    fallback="#000000"
                    onCommit={(value) => updateSelectedElementsStyle({ color: value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberPropertyEditor
                    label="Font size"
                    value={readSelectedStyleValue("fontSize").value as number | undefined}
                    mixed={readSelectedStyleValue("fontSize").mixed}
                    min={8}
                    max={180}
                    onCommit={(value) => updateSelectedElementsStyle({ fontSize: value })}
                  />
                  <SelectPropertyEditor
                    label="Shadow"
                    value={readSelectedStyleValue("shadow").value as string | undefined}
                    mixed={readSelectedStyleValue("shadow").mixed}
                    options={[
                      { label: "None", value: "none" },
                      { label: "Small", value: "sm" },
                      { label: "Medium", value: "md" },
                      { label: "Large", value: "lg" },
                      { label: "X-Large", value: "xl" },
                    ]}
                    onCommit={(value) => updateSelectedElementsStyle({ shadow: value as ElementStyle["shadow"] })}
                  />
                </div>
                <TextPropertyEditor
                  label="Transform"
                  value={readSelectedStyleValue("transform").value as string | undefined}
                  mixed={readSelectedStyleValue("transform").mixed}
                  placeholder="translate(10px, 0px)"
                  onCommit={(value) => updateSelectedElementsStyle({ position: value ? "relative" : undefined, transform: value || undefined })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="justify-start gap-2" onClick={bringSelectedToFront}>
                  <ArrowUpToLine size={13} /> Front
                </Button>
                <Button variant="outline" size="sm" className="justify-start gap-2" onClick={sendSelectedToBack}>
                  <ArrowDownToLine size={13} /> Back
                </Button>
                <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => setSelectedElementsLock(true)}>
                  <Lock size={13} /> Lock
                </Button>
                <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => setSelectedElementsLock(false)}>
                  <Unlock size={13} /> Unlock
                </Button>
                <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => copyElements()}>
                  <Copy size={13} /> Copy
                </Button>
                <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => duplicateElements()}>
                  <Layers size={13} /> Duplicate
                </Button>
              </div>
              <Button variant="destructive" size="sm" className="w-full justify-start gap-2" onClick={hideSelectedElements}>
                <Trash2 size={13} /> Delete selected
              </Button>
              <div>
                <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Selection</div>
                <div className="space-y-1.5">
                  {selectedEls.map((element) => (
                    <button
                      key={element.id}
                      onClick={() => selectElement(element, selectedRects[element.id] ?? null)}
                      className="w-full rounded-md border border-border px-3 py-2 text-left hover:bg-muted/50"
                    >
                      <div className="truncate text-xs font-medium">{element.label || element.id}</div>
                      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{element.tag ?? "ELEMENT"} · {element.id}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        ) : selectedEl ? (
          <ElementInspector
            embedded
            width={rightWidth}
            id={selectedEl.id}
            label={selectedEl.label}
            kind={selectedKind ?? "generic"}
            theme={theme}
            activeTab={inspectorTab}
            onChangeTab={setInspectorTab}
            onChangeStyle={(patch, bp) => updateElStyle(selectedEl.id, patch, bp)}
            onChangeStyleLive={(patch, bp) => queueLiveStyleUpdate(selectedEl.id, patch, bp)}
            onChangeStyleAtBp={(bp, patch) => updateElStyle(selectedEl.id, patch, bp)}
            onClearStyle={(bp) => clearElStyle(selectedEl.id, bp)}
            onClose={clearSelection}
            onReplaceImage={
              (selectedEl.replaceable || selectedEl.id === "hero-banner" || selectedEl.id.startsWith("banner-") || selectedEl.id.startsWith("overlay-") || selectedEl.id.startsWith("cblock-"))
                ? () => requestReplaceImage(selectedEl.id)
                : undefined
            }
            onChangeText={(v) => setElementText(selectedEl.id, v)}
            onChangeLink={(link) => setElementLink(selectedEl.id, link)}
            items={items}
            onToast={(t) => toast(t)}
            locked={!!theme.element_locks?.[selectedEl.id]}
            onToggleLock={(v) => setElementLock(selectedEl.id, v)}
            onCopyStyle={() => copyStyleOf(selectedEl.id)}
            onPasteStyle={() => pasteStyleTo(selectedEl.id)}
            onDuplicate={() => duplicateElements([selectedEl.id])}
            onMoveUp={selectedEl.id.startsWith("cblock-") ? () => moveCustomBlock(selectedEl.id.slice("cblock-".length), -1) : undefined}
            onMoveDown={selectedEl.id.startsWith("cblock-") ? () => moveCustomBlock(selectedEl.id.slice("cblock-".length), 1) : undefined}
            onBringFront={() => bringToFront(selectedEl.id)}
            onSendBack={() => sendToBack(selectedEl.id)}
            onAlignPage={(v) => alignOnPage(selectedEl.id, v)}
            onDelete={() => {
              deleteElements([selectedEl.id]);
            }}
            onOpenContextMenu={(clientX, clientY) => setContextMenu({ id: selectedEl.id, clientX, clientY })}
            customBlock={selectedEl.id.startsWith("cblock-") ? (theme.custom_blocks ?? []).find((b) => b.id === selectedEl.id.slice("cblock-".length)) : undefined}
            selectedTag={selectedEl.tag}
            selectedText={selectedEl.text}
            media={theme.element_media?.[selectedEl.id]}
            onChangeMedia={(patch) => setTheme((th) => ({
              ...th,
              element_media: {
                ...(th.element_media ?? {}),
                [selectedEl.id]: { ...((th.element_media ?? {})[selectedEl.id] ?? {}), ...patch },
              },
            }))}
            onChangeBlockProps={(patch) => {
              if (!selectedEl.id.startsWith("cblock-")) return;
              updateCustomBlockProps(selectedEl.id.slice("cblock-".length), patch);
            }}
            note={elementNotes[selectedEl.id] ?? ""}
            onChangeNote={(v) => setElementNotes((n) => ({ ...n, [selectedEl.id]: v }))}
            toggleBold={() => toggleBold(selectedEl.id)}
            toggleItalic={() => toggleItalic(selectedEl.id)}
            toggleUnderline={() => toggleUnderline(selectedEl.id)}
            toggleStrike={() => toggleStrikethrough(selectedEl.id)}
            toggleUppercase={() => toggleUppercase(selectedEl.id)}
            setAlign={(v) => setAlign(selectedEl.id, v)}
            setListStyle={(k) => setListStyle(selectedEl.id, k)}
            effectId={activeTextEffect(selectedEl.id)}
            onSetEffect={(id) => setTextEffect(selectedEl.id, id)}
            effects={TEXT_EFFECTS}
            isCustomCssActive={(key, val) => isCustomCssActive(selectedEl.id, key, val)}
          />
        ) : (
          <SettingsSidebar
            width={rightWidth}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            tabItems={TAB_ITEMS}
            form={form}
            setForm={setForm}
            theme={theme}
            setTheme={setTheme}
            items={items}
            userId={user?.id}
            onToggleSection={toggleSection}
            onSetTextOverride={setTextOverride}
            onAddOverlay={addOverlay}
            onAddBanner={addBanner}
            onRemoveBanner={removeBanner}
            onMoveBanner={moveBanner}
            onAddSpecialSection={addSpecialSection}
            onUpdateSpecialSection={updateSpecialSection}
            onRemoveSpecialSection={removeSpecialSection}
            onApplyPreset={applyPreset}
            onResetTheme={resetTheme}
          />
        )}
      </div>
    </div>
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={paletteCommands} />

    {/* ============ RIGHT-CLICK CONTEXT MENU ============ */}
    {contextMenu && (() => {
      const isBlock = contextMenu.id.startsWith("cblock-");
      const locked = !!theme.element_locks?.[contextMenu.id];
      const close = () => setContextMenu(null);
      return (
        <FixedMenu x={contextMenu.clientX} y={contextMenu.clientY} onClose={close}>
          <DropdownRow icon={Copy} label="Copy" hint="⌘C" onClick={() => { copyElement(contextMenu.id); close(); }} />
          <DropdownRow icon={PaletteIcon} label="Copy style" onClick={() => { copyStyleOf(contextMenu.id); close(); }} />
          <DropdownRow icon={ClipboardPaste} label="Paste" hint="⌘V" disabled={!hasClipboard} onClick={() => { pasteElement(); close(); }} />
          <DropdownRow icon={ClipboardPaste} label="Paste style" onClick={() => { pasteStyleTo(contextMenu.id); close(); }} />
          <DropdownRow icon={Layers} label="Duplicate" hint="⌘D" onClick={() => { duplicateElements([contextMenu.id]); close(); }} />
          <DropdownRow icon={Trash2} label="Delete" hint="Del" danger onClick={() => {
            deleteElements([contextMenu.id]);
            close();
          }} />
          <MenuDivider />
          <div className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Layer</div>
          <DropdownRow icon={ArrowUpToLine} label="Bring to front" onClick={() => { bringToFront(contextMenu.id); close(); }} />
          <DropdownRow icon={ArrowDownToLine} label="Send to back" onClick={() => { sendToBack(contextMenu.id); close(); }} />
          {isBlock && <DropdownRow icon={ChevronUp} label="Move up" onClick={() => { moveCustomBlock(contextMenu.id.slice("cblock-".length), -1); close(); }} />}
          {isBlock && <DropdownRow icon={ChevronDown} label="Move down" onClick={() => { moveCustomBlock(contextMenu.id.slice("cblock-".length), 1); close(); }} />}
          <MenuDivider />
          <div className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Align to page</div>
          <div className="flex items-center gap-1 px-2.5 pb-1.5">
            {(["left", "center", "right"] as const).map((v) => (
              <button key={v} onClick={() => { alignOnPage(contextMenu.id, v); close(); }} className="h-7 w-7 grid place-items-center rounded border border-border hover:bg-muted">
                {v === "left" ? <AlignLeft size={12} /> : v === "center" ? <AlignCenter size={12} /> : <AlignRight size={12} />}
              </button>
            ))}
          </div>
          <MenuDivider />
          <DropdownRow icon={Lock} label={locked ? "Unlock" : "Lock"} onClick={() => { setElementLock(contextMenu.id, !locked); close(); }} />
          <DropdownRow icon={Link2} label="Link" onClick={() => { setInspectorTab("interactions"); close(); }} />
          <DropdownRow icon={MessageCircle} label="Comment" onClick={() => { setInspectorTab("interactions"); close(); toast({ title: "Add a note", description: "Use the Notes field in the Interactions tab." }); }} />
          <MenuDivider />
          <DropdownRow icon={SlidersHorizontal} label="More options" onClick={() => { setInspectorTab("advanced"); close(); }} />
        </FixedMenu>
      );
    })()}
    </>
  );
};

export default MyStore;
