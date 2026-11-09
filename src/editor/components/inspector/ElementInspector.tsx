import { useState, type ReactNode } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  ImageIcon as ImgIcon,
  Italic,
  List,
  ListOrdered,
  Lock,
  Monitor,
  MoreHorizontal,
  Play,
  RotateCcw,
  Smartphone,
  Sparkles,
  Strikethrough,
  Tablet,
  Trash2,
  Type,
  Underline,
  Upload,
  Wand2,
  X as XIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { INSPECTOR_PROFILES } from "@/editor/constants/editorConstants";
import type { Bp, ElementKind, InspectorFeature, InspectorTab } from "@/editor/types/editor";
import { supportsInspectorFeature } from "@/editor/utils/elementClassification";
import { TextPropertyEditor } from "@/document/inspector/editors";
import type { ElementStyle, StoreTheme } from "@/lib/storeTheme";

// ============ Small collapsible section used inside the inspector tabs ============
const Collapsible = ({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-2.5 py-2 text-left hover:bg-muted/40">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        <ChevronDown size={13} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="p-2.5 pt-1 space-y-3 border-t border-border">{children}</div>}
    </div>
  );
};

// ============ Floating element-style inspector (Shopify-like) ============
export const ElementInspector = ({
  embedded = false,
  width = 320,
  id, label, kind, theme, onChangeStyle, onChangeStyleLive, onChangeStyleAtBp, onClearStyle, onClose, onReplaceImage, onChangeText, onChangeLink, items, onToast,
  locked, onToggleLock, onCopyStyle, onPasteStyle,
  onDuplicate, onMoveUp, onMoveDown, onDelete, onBringFront, onSendBack, onAlignPage, onOpenContextMenu,
  customBlock, onChangeBlockProps,
  selectedTag, selectedText, media, onChangeMedia,
  activeTab, onChangeTab,
  note, onChangeNote,
  toggleBold, toggleItalic, toggleUnderline, toggleStrike, toggleUppercase,
  setAlign, setListStyle, effectId, onSetEffect, effects, isCustomCssActive,
}: {
  embedded?: boolean;
  width?: number;
  id: string;
  label: string;
  kind: ElementKind;
  theme: StoreTheme;
  onChangeStyle: (patch: Partial<ElementStyle>, bp: Bp) => void;
  onChangeStyleLive: (patch: Partial<ElementStyle>, bp: Bp) => void;
  onChangeStyleAtBp: (bp: Bp, patch: Partial<ElementStyle>) => void;
  onClearStyle: (bp: Bp) => void;
  onClose: () => void;
  onReplaceImage?: () => void;
  onChangeText: (value: string) => void;
  onChangeLink: (link: import("@/lib/storeTheme").ElementLink | null) => void;
  items: any[];
  onToast: (t: { title: string; description?: string; variant?: "destructive" }) => void;
  locked: boolean;
  onToggleLock: (v: boolean) => void;
  onCopyStyle: () => void;
  onPasteStyle: () => void;
  onDuplicate?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete?: () => void;
  onBringFront: () => void;
  onSendBack: () => void;
  onAlignPage: (v: "left" | "center" | "right") => void;
  onOpenContextMenu: (clientX: number, clientY: number) => void;
  customBlock?: import("@/lib/storeTheme").CustomBlock;
  selectedTag?: string;
  selectedText?: string;
  media?: import("@/lib/storeTheme").ElementMedia;
  onChangeMedia: (patch: Partial<import("@/lib/storeTheme").ElementMedia>) => void;
  onChangeBlockProps: (patch: Partial<import("@/lib/storeTheme").CustomBlock["props"]>) => void;
  activeTab: "style" | "advanced" | "interactions";
  onChangeTab: (t: "style" | "advanced" | "interactions") => void;
  note: string;
  onChangeNote: (v: string) => void;
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrike: () => void;
  toggleUppercase: () => void;
  setAlign: (v: "left" | "center" | "right" | "justify") => void;
  setListStyle: (v: "disc" | "decimal" | "none") => void;
  effectId: string;
  onSetEffect: (id: string) => void;
  effects: { id: string; label: string; value?: string }[];
  isCustomCssActive: (key: string, val: any) => boolean;
}) => {
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [bp, setBp] = useState<Bp>("desktop");

  const styleMap =
    bp === "mobile" ? (theme.element_styles_mobile ?? {})
    : bp === "tablet" ? (theme.element_styles_tablet ?? {})
    : theme.element_styles;
  const style: ElementStyle = styleMap[id] ?? {};
  const onChange = (patch: Partial<ElementStyle>) => onChangeStyle(patch, bp);
  const onChangeLive = (patch: Partial<ElementStyle>) => onChangeStyleLive(patch, bp);
  const supports = (feature: InspectorFeature) => supportsInspectorFeature(kind, feature);

  const existingText = theme.element_text?.[id] ?? selectedText ?? "";
  const existingLink = theme.element_links?.[id];
  const isLikelyButton = kind === "button" || /(cta|btn|button|link|nav|search)/i.test(id);
  const bold = (style.fontWeight ?? 400) >= 600;

  const runAiEdit = async () => {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("element-ai-edit", {
        body: { label, elementId: id, instruction: aiPrompt, currentStyle: style, theme },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const patch = (data as any)?.patch ?? {};
      if (Object.keys(patch).length === 0) {
        onToast({ title: "AI had no changes to suggest", description: "Try a more specific instruction." });
      } else {
        onChange(patch);
        onToast({ title: "✨ Element updated", description: (data as any)?.rationale });
        setAiPrompt("");
      }
    } catch (e: any) {
      onToast({ title: "AI couldn't edit this", description: e.message ?? "Try again", variant: "destructive" });
    } finally {
      setAiBusy(false);
    }
  };

  const stripUnit = (value: string | number | undefined, fallback = 0) => {
    if (typeof value === "number") return value;
    const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const setPx = (key: "left" | "top" | "width" | "height", value: string) => {
    const next = Number(value);
    onChange({ position: key === "left" || key === "top" ? "absolute" : style.position, [key]: Number.isFinite(next) ? `${next}px` : undefined } as Partial<ElementStyle>);
  };
  const rotationValue = (() => {
    const match = String(style.transform ?? "").match(/rotate\((-?\d+(?:\.\d+)?)deg\)/);
    return match ? Number(match[1]) : 0;
  })();
  const setRotation = (value: string) => {
    const next = Number(value);
    const rest = String(style.transform ?? "").replace(/rotate\([^)]*\)/g, "").trim();
    onChange({ transform: `${rest} rotate(${Number.isFinite(next) ? next : 0}deg)`.trim() });
  };
  const opacityPercent = Math.round((style.opacity ?? 1) * 100);
  const isMediaElement = supports("media") || !!media?.src || /(img|video|iframe)/i.test(selectedTag ?? "");
  const inspectorKind =
    kind === "image" || isMediaElement ? "Image"
    : kind === "text" ? "Text"
    : kind === "button" ? "Button"
    : INSPECTOR_PROFILES[kind].label;
  const iconButtonClass = "sb-figma-icon-btn";

  if (width >= 0) {
    return (
      <aside
        style={{ width }}
        className="sb-figma-inspector shrink-0 overflow-y-auto border-l"
      >
        <div className="flex h-[68px] items-start justify-between border-b border-[#3c3c3c] px-3 py-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-[#8b5cf6] text-xs font-semibold text-white">J</div>
              <ChevronDown size={12} className="text-[#b8b8b8]" />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button onClick={() => onChangeTab("style")} className={`rounded px-2 py-1 text-[11px] font-semibold ${activeTab !== "interactions" ? "bg-white text-[#1e1e1e]" : "text-[#b8b8b8]"}`}>
                Design
              </button>
              <button onClick={() => onChangeTab("interactions")} className={`rounded px-2 py-1 text-[11px] font-semibold ${activeTab === "interactions" ? "bg-white text-[#1e1e1e]" : "text-[#b8b8b8]"}`}>
                Prototype
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className={iconButtonClass} title="Preview"><Play size={15} /></button>
            <button className="h-8 rounded bg-[#0178ff] px-3 text-[11px] font-semibold text-white">Share</button>
            <button className={iconButtonClass} title="More" onClick={(event) => onOpenContextMenu(event.clientX, event.clientY)}><MoreHorizontal size={16} /></button>
            <div className="absolute right-3 top-11 flex items-center gap-1 text-[11px] font-semibold text-white">
              81% <ChevronDown size={12} />
            </div>
          </div>
        </div>

        <div className="sb-figma-section flex items-center justify-between">
          <div className="sb-figma-title truncate">{inspectorKind}</div>
          <div className="flex items-center gap-1">
            {onReplaceImage && <button className={iconButtonClass} onClick={onReplaceImage} title="Replace"><Upload size={13} /></button>}
            <button className={iconButtonClass} onClick={() => onToggleLock(!locked)} title={locked ? "Unlock" : "Lock"}><Lock size={13} /></button>
            {onDuplicate && <button className={iconButtonClass} onClick={onDuplicate} title="Duplicate"><Copy size={13} /></button>}
            {onDelete && <button className={iconButtonClass} onClick={onDelete} title="Delete"><Trash2 size={13} /></button>}
            <button className={iconButtonClass} onClick={(event) => onOpenContextMenu(event.clientX, event.clientY)} title="More"><MoreHorizontal size={15} /></button>
          </div>
        </div>

        <div className="sb-figma-section space-y-3">
          <div className="sb-figma-title">Position</div>
          <div className="space-y-1">
            <div className="sb-figma-label">Alignment</div>
            <div className="grid grid-cols-6 gap-1">
              <button className={iconButtonClass} onClick={() => onAlignPage("left")}><AlignLeft size={13} /></button>
              <button className={iconButtonClass} onClick={() => onAlignPage("center")}><AlignCenter size={13} /></button>
              <button className={iconButtonClass} onClick={() => onAlignPage("right")}><AlignRight size={13} /></button>
              <button className={iconButtonClass} onClick={onBringFront}><ArrowUpToLine size={13} /></button>
              <button className={iconButtonClass} onClick={onSendBack}><ArrowDownToLine size={13} /></button>
              <button className={iconButtonClass} onClick={() => onChange({ position: "absolute" })}>L</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="sb-figma-label">Position</span>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#b8b8b8]">X</span>
                <input className="sb-figma-field w-full pl-6" value={stripUnit(style.left)} onChange={(event) => setPx("left", event.target.value)} />
              </div>
            </label>
            <label className="space-y-1">
              <span className="sb-figma-label opacity-0">Y</span>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#b8b8b8]">Y</span>
                <input className="sb-figma-field w-full pl-6" value={stripUnit(style.top)} onChange={(event) => setPx("top", event.target.value)} />
              </div>
            </label>
          </div>
          <div className="space-y-1">
            <div className="sb-figma-label">Rotation</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="relative">
                <RotateCcw size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#b8b8b8]" />
                <input className="sb-figma-field w-full pl-7" value={rotationValue} onChange={(event) => setRotation(event.target.value)} />
              </div>
              <button className={iconButtonClass} onClick={() => setRotation("0")}>0</button>
              <button className={iconButtonClass} onClick={() => onChange({ transform: undefined })}>Reset</button>
            </div>
          </div>
        </div>

        <div className="sb-figma-section space-y-3">
          <div className="sb-figma-title">Layout</div>
          <div className="space-y-1">
            <div className="sb-figma-label">Dimensions</div>
            <div className="grid grid-cols-[1fr_1fr_28px] gap-2">
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#b8b8b8]">W</span>
                <input className="sb-figma-field w-full pl-6" value={stripUnit(style.width)} onChange={(event) => setPx("width", event.target.value)} />
              </div>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#b8b8b8]">H</span>
                <input className="sb-figma-field w-full pl-6" value={stripUnit(style.height)} onChange={(event) => setPx("height", event.target.value)} />
              </div>
              <button className={`${iconButtonClass} sb-figma-icon-btn-active`} title="Independent dimensions">L</button>
            </div>
          </div>
        </div>

        <div className="sb-figma-section space-y-3">
          <div className="sb-figma-title flex items-center justify-between">
            <span>Appearance</span>
            <button className={iconButtonClass} onClick={() => onChange({ opacity: style.opacity === 0 ? 1 : 0 })}>O</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="sb-figma-label">Opacity</span>
              <div className="relative">
                <input className="sb-figma-field w-full pr-7" value={opacityPercent} onChange={(event) => onChange({ opacity: Math.max(0, Math.min(100, Number(event.target.value) || 0)) / 100 })} />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#b8b8b8]">%</span>
              </div>
            </label>
            <label className="space-y-1">
              <span className="sb-figma-label">Corner radius</span>
              <input className="sb-figma-field w-full" value={style.radius ?? 0} onChange={(event) => onChange({ radius: Number(event.target.value) || 0 })} />
            </label>
          </div>
        </div>

        <div className="sb-figma-section space-y-3">
          <div className="sb-figma-title flex items-center justify-between">
            <span>Fill</span>
            <div className="flex items-center gap-1">
              <button className={iconButtonClass} onClick={() => onChange({ bg: style.bg ?? "#ffffff" })}>+</button>
              <button className={iconButtonClass} onClick={() => onChange({ bg: undefined, bgImage: undefined, gradient: undefined })}>-</button>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_54px_24px_24px] items-center gap-1">
            <button className="sb-figma-field flex items-center gap-2 text-left" onClick={onReplaceImage}>
              <span className="h-3 w-3 rounded-sm bg-white" />
              <span className="truncate">{isMediaElement ? "Image" : "Solid"}</span>
            </button>
            <div className="relative">
              <input className="sb-figma-field w-full pr-5" value="100" readOnly />
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-[#b8b8b8]">%</span>
            </div>
            <button className={iconButtonClass} onClick={() => onChange({ hidden: !style.hidden })}>O</button>
            <button className={iconButtonClass} onClick={() => onChange({ bg: undefined, bgImage: undefined, gradient: undefined })}>-</button>
          </div>
          {!isMediaElement && (
            <input type="color" className="h-8 w-full rounded border-0 bg-[#383838] p-1" value={style.bg ?? "#ffffff"} onChange={(event) => onChange({ bg: event.target.value })} />
          )}
        </div>

        <div className="sb-figma-section flex items-center justify-between">
          <span className="sb-figma-title">Stroke</span>
          <button className={iconButtonClass} onClick={() => onChange({ borderWidth: style.borderWidth ?? 1, borderColor: style.borderColor ?? "#ffffff" })}>+</button>
        </div>

        <div className="sb-figma-section flex items-center justify-between">
          <span className="sb-figma-title">Effects</span>
          <button className={iconButtonClass} onClick={() => onChange({ shadow: style.shadow === "md" ? "none" : "md" })}>+</button>
        </div>

        <div className="sb-figma-section flex items-center justify-between">
          <span className="sb-figma-title">Export</span>
          <button className={iconButtonClass}>+</button>
        </div>
      </aside>
    );
  }

  return (
    <aside style={{ width }} className={embedded
      ? "sb-editor-panel w-80 shrink-0 overflow-y-auto border-l border-border p-3 space-y-3"
      : "sb-editor-panel absolute top-14 right-3 w-80 max-h-[calc(100%-110px)] overflow-y-auto border border-border rounded-xl shadow-2xl z-30 p-3 space-y-3"}>
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{INSPECTOR_PROFILES[kind].label} inspector</div>
          <div className="text-sm font-semibold truncate">{label || id}</div>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-muted rounded text-muted-foreground"><XIcon size={14} /></button>
      </div>

      {/* ===== Action toolbar: duplicate / move / lock / copy-paste / delete / more ===== */}
      <div className="flex items-center flex-wrap gap-1 border border-border rounded-md p-1 bg-muted/30">
        {onMoveUp && (
          <button onClick={onMoveUp} className="h-7 px-2 rounded text-[11px] hover:bg-background flex items-center gap-1" title="Move up">
            <ChevronUp size={12} /> Up
          </button>
        )}
        {onMoveDown && (
          <button onClick={onMoveDown} className="h-7 px-2 rounded text-[11px] hover:bg-background flex items-center gap-1" title="Move down">
            <ChevronDown size={12} /> Down
          </button>
        )}
        {onDuplicate && (
          <button onClick={onDuplicate} className="h-7 px-2 rounded text-[11px] hover:bg-background flex items-center gap-1" title="Duplicate">
            <Copy size={12} /> Duplicate
          </button>
        )}
        <button onClick={onCopyStyle} className="h-7 px-2 rounded text-[11px] hover:bg-background flex items-center gap-1" title="Copy styles across breakpoints">
          <Copy size={12} /> Copy style box
        </button>
        <button onClick={onPasteStyle} className="h-7 px-2 rounded text-[11px] hover:bg-background flex items-center gap-1" title="Paste last copied style">
          <Check size={12} /> Paste
        </button>
        <button onClick={() => onToggleLock(!locked)} className={`h-7 px-2 rounded text-[11px] flex items-center gap-1 ${locked ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "hover:bg-background"}`} title={locked ? "Locked — click to unlock" : "Lock element"}>
          <Lock size={12} /> {locked ? "Locked" : "Lock"}
        </button>
        {onDelete && (
          <button onClick={onDelete} className="h-7 px-2 rounded text-[11px] hover:bg-destructive/10 text-destructive flex items-center gap-1" title="Delete block">
            <Trash2 size={12} /> Delete
          </button>
        )}
        <button
          onClick={(e) => onOpenContextMenu(e.clientX, e.clientY)}
          className="h-7 px-2 rounded text-[11px] hover:bg-background flex items-center gap-1 ml-auto"
          title="More actions"
        >
          <MoreHorizontal size={12} />
        </button>
      </div>

      {/* ===== Block-specific properties ===== */}
      {customBlock && supports("blockProps") && (
        <div className="rounded-lg border border-border p-2 space-y-2 bg-muted/20">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Block props</div>
          {(customBlock.kind === "image" || customBlock.kind === "video") && (
            <div>
              <Label className="text-[10px]">{customBlock.kind === "image" ? "Image URL" : "Video URL (YouTube / Vimeo / MP4)"}</Label>
              <Input className="h-7 text-xs" value={customBlock.props.src ?? ""}
                onChange={(e) => onChangeBlockProps({ src: e.target.value })}
                placeholder={customBlock.kind === "image" ? "https://…/image.jpg" : "https://youtu.be/…"} />
            </div>
          )}
          {customBlock.kind === "image" && (
            <div>
              <Label className="text-[10px]">Alt text</Label>
              <Input className="h-7 text-xs" value={customBlock.props.alt ?? ""}
                onChange={(e) => onChangeBlockProps({ alt: e.target.value })}
                placeholder="Describe the image for accessibility" />
            </div>
          )}
          {customBlock.kind === "spacer" && (
            <div>
              <Label className="text-[10px]">Height {customBlock.props.height ?? 48}px</Label>
              <Slider value={[customBlock.props.height ?? 48]} min={4} max={240} step={4}
                onValueChange={([v]) => onChangeBlockProps({ height: v })} />
            </div>
          )}
          {customBlock.kind === "icon" && (
            <div>
              <Label className="text-[10px]">Icon (emoji or single char)</Label>
              <Input className="h-7 text-xs" value={customBlock.props.icon ?? ""}
                onChange={(e) => onChangeBlockProps({ icon: e.target.value })}
                placeholder="✨ 🔥 ⭐" maxLength={4} />
            </div>
          )}
        </div>
      )}

      {/* Device tabs — styles apply only at the selected breakpoint */}
      <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
        {([
          { id: "desktop", icon: Monitor, tip: "Desktop styles" },
          { id: "tablet", icon: Tablet, tip: "Tablet styles" },
          { id: "mobile", icon: Smartphone, tip: "Mobile styles" },
        ] as const).map((d) => (
          <button key={d.id} onClick={() => setBp(d.id)}
            className={`flex-1 h-7 grid place-items-center rounded transition-colors ${bp === d.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title={d.tip}>
            <d.icon size={12} />
          </button>
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground -mt-1 px-0.5">
        Editing <b>{bp}</b> styles. Tablet and mobile stack over desktop.
      </div>

      {/* ===== Inline text override + quick formatting ===== */}
      {supports("text") && (
      <div className="rounded-lg border border-border p-2 space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Type size={11} /> Text
        </div>
        <Textarea
          value={existingText}
          placeholder="Override this element's text (leave blank to keep original)"
          rows={2}
          onChange={(e) => onChangeText(e.target.value)}
          className="text-xs resize-none min-h-[48px]"
        />
        <div className="flex items-center flex-wrap gap-0.5 pt-1">
          <button onClick={toggleBold} className={`h-7 w-7 grid place-items-center rounded ${bold ? "bg-foreground text-background" : "hover:bg-muted"}`}><Bold size={12} /></button>
          <button onClick={toggleItalic} className={`h-7 w-7 grid place-items-center rounded ${isCustomCssActive("fontStyle", "italic") ? "bg-foreground text-background" : "hover:bg-muted"}`}><Italic size={12} /></button>
          <button onClick={toggleUnderline} className={`h-7 w-7 grid place-items-center rounded ${isCustomCssActive("textDecoration", "underline") ? "bg-foreground text-background" : "hover:bg-muted"}`}><Underline size={12} /></button>
          <button onClick={toggleStrike} className={`h-7 w-7 grid place-items-center rounded ${isCustomCssActive("textDecoration", "line-through") ? "bg-foreground text-background" : "hover:bg-muted"}`}><Strikethrough size={12} /></button>
          <div className="mx-0.5 h-5 w-px bg-border" />
          <button onClick={() => setAlign("left")} className={`h-7 w-7 grid place-items-center rounded ${(style.align ?? "left") === "left" ? "bg-foreground text-background" : "hover:bg-muted"}`}><AlignLeft size={12} /></button>
          <button onClick={() => setAlign("center")} className={`h-7 w-7 grid place-items-center rounded ${style.align === "center" ? "bg-foreground text-background" : "hover:bg-muted"}`}><AlignCenter size={12} /></button>
          <button onClick={() => setAlign("right")} className={`h-7 w-7 grid place-items-center rounded ${style.align === "right" ? "bg-foreground text-background" : "hover:bg-muted"}`}><AlignRight size={12} /></button>
          <div className="mx-0.5 h-5 w-px bg-border" />
          <button onClick={() => setListStyle("disc")} className={`h-7 w-7 grid place-items-center rounded ${isCustomCssActive("listStyleType", "disc") ? "bg-foreground text-background" : "hover:bg-muted"}`}><List size={12} /></button>
          <button onClick={() => setListStyle("decimal")} className={`h-7 w-7 grid place-items-center rounded ${isCustomCssActive("listStyleType", "decimal") ? "bg-foreground text-background" : "hover:bg-muted"}`}><ListOrdered size={12} /></button>
        </div>
        <div className="text-[10px] text-muted-foreground">Tip: double-click any block in the preview to edit its text inline.</div>
      </div>
      )}

      {supports("media") && onReplaceImage && (
        <Button size="sm" variant="outline" onClick={onReplaceImage} className="w-full h-8 text-xs">
          <Upload size={12} className="mr-1.5" /> Replace image
        </Button>
      )}
      {supports("media") && (onReplaceImage || media?.src || /(img|video|iframe)/i.test(selectedTag ?? "")) && (
        <div className="rounded-lg border border-border p-2 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <ImgIcon size={11} /> Media
          </div>
          <Input className="h-7 text-xs" placeholder="Image, video, iframe, or background URL" value={media?.src ?? ""} onChange={(e) => onChangeMedia({ src: e.target.value || undefined })} />
          <Input className="h-7 text-xs" placeholder="Alt text / accessibility label" value={media?.alt ?? ""} onChange={(e) => onChangeMedia({ alt: e.target.value || undefined })} />
        </div>
      )}

      {/* ===== AI edit this element ===== */}
      {supports("ai") && <div className="rounded-lg border border-foreground/10 bg-gradient-to-br from-violet-50 via-white to-orange-50 dark:from-violet-950/30 dark:via-background dark:to-orange-950/30 p-2 space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
          <Sparkles size={11} className="text-violet-500" /> Edit with AI
        </div>
        <Textarea
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runAiEdit(); }}
          placeholder="e.g. Make it bolder, dark card, rounded 16px"
          rows={2}
          className="text-xs resize-none min-h-[52px] bg-background/70"
        />
        <Button
          size="sm"
          onClick={runAiEdit}
          disabled={aiBusy || !aiPrompt.trim()}
          className="w-full h-7 text-xs bg-gradient-to-r from-violet-600 to-orange-500 hover:opacity-90 text-white border-0"
        >
          <Wand2 size={11} className="mr-1.5" />
          {aiBusy ? "Applying…" : "Ask AI to redesign"}
        </Button>
      </div>}

      {/* ===== Style / Advanced / Interactions ===== */}
      <div className="grid grid-cols-3 rounded-md bg-muted p-0.5">
        {([
          { id: "style", label: "Style" },
          { id: "advanced", label: "Advanced" },
          { id: "interactions", label: "Interactions" },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => onChangeTab(t.id)}
            className={`h-7 rounded text-[11px] font-medium transition-colors ${activeTab === t.id ? "bg-primary text-primary-foreground shadow-none" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "style" && (
        <div className="space-y-2">
          {supports("spacing") && <Collapsible title="Spacing" defaultOpen>
            <div>
              <Label className="text-[10px]">Padding {style.padding ?? 0}px</Label>
              <Slider value={[style.padding ?? 0]} min={0} max={64} step={1} onValueChange={([v]) => onChangeLive({ padding: v })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Margin {style.margin ?? 0}px</Label>
                <Slider value={[style.margin ?? 0]} min={0} max={96} step={1} onValueChange={([v]) => onChangeLive({ margin: v })} />
              </div>
              <div>
                <Label className="text-[10px]">Gap {style.gap ?? 0}px</Label>
                <Slider value={[style.gap ?? 0]} min={0} max={96} step={1} onValueChange={([v]) => onChangeLive({ gap: v })} />
              </div>
            </div>
          </Collapsible>}

          {supports("appearance") && <Collapsible title="Background">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Background</Label>
                <Input type="color" value={style.bg ?? "#ffffff"} onChange={(e) => onChange({ bg: e.target.value })} className="h-7 p-0.5" />
              </div>
              <div>
                <Label className="text-[10px]">Text color</Label>
                <Input type="color" value={style.color ?? "#000000"} onChange={(e) => onChange({ color: e.target.value })} className="h-7 p-0.5" />
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Gradient / background image</Label>
              <Input
                className="h-7 text-xs"
                placeholder="linear-gradient(...) or image URL"
                value={style.gradient ?? style.bgImage ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  onChange(v.startsWith("linear-gradient") || v.startsWith("radial-gradient") ? { gradient: v, bgImage: undefined } : { bgImage: v || undefined, gradient: undefined });
                }}
              />
            </div>
          </Collapsible>}

          {supports("border") && <Collapsible title="Border & Shadow">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Border width {style.borderWidth ?? 0}px</Label>
                <Slider value={[style.borderWidth ?? 0]} min={0} max={16} step={1} onValueChange={([v]) => onChangeLive({ borderWidth: v })} />
              </div>
              <div>
                <Label className="text-[10px]">Border color</Label>
                <Input type="color" value={style.borderColor ?? "#000000"} onChange={(e) => onChange({ borderColor: e.target.value })} className="h-7 p-0.5" />
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Border radius {style.radius ?? 0}px</Label>
              <Slider value={[style.radius ?? 0]} min={0} max={48} step={1} onValueChange={([v]) => onChangeLive({ radius: v })} />
            </div>
            <div>
              <Label className="text-[10px]">Shadow</Label>
              <Select value={style.shadow ?? "none"} onValueChange={(v: any) => onChange({ shadow: v })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="sm">Small</SelectItem>
                  <SelectItem value="md">Medium</SelectItem>
                  <SelectItem value="lg">Large</SelectItem>
                  <SelectItem value="xl">X-Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Collapsible>}

          {supports("typography") && <Collapsible title="Typography">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Font size {style.fontSize ?? "—"}</Label>
                <Slider value={[style.fontSize ?? 16]} min={8} max={72} step={1} onValueChange={([v]) => onChangeLive({ fontSize: v })} />
              </div>
              <div>
                <Label className="text-[10px]">Weight {style.fontWeight ?? "—"}</Label>
                <Slider value={[style.fontWeight ?? 400]} min={300} max={900} step={100} onValueChange={([v]) => onChangeLive({ fontWeight: v })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Line height {style.lineHeight ?? "auto"}</Label>
                <Slider value={[style.lineHeight ?? 1.2]} min={0.8} max={3} step={0.05} onValueChange={([v]) => onChangeLive({ lineHeight: v })} />
              </div>
              <div>
                <Label className="text-[10px]">Letter spacing {style.letterSpacing ?? 0}px</Label>
                <Slider value={[style.letterSpacing ?? 0]} min={0} max={12} step={0.5} onValueChange={([v]) => onChangeLive({ letterSpacing: v })} />
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Font family</Label>
              <Input className="h-7 text-xs" placeholder="Inter, Georgia, sans-serif" value={style.fontFamily ?? ""} onChange={(e) => onChange({ fontFamily: e.target.value || undefined })} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-2">
              <Label className="text-[10px]">UPPERCASE</Label>
              <Switch checked={isCustomCssActive("textTransform", "uppercase")} onCheckedChange={toggleUppercase} />
            </div>
            <div>
              <Label className="text-[10px]">Text effect</Label>
              <Select value={effectId} onValueChange={onSetEffect}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {effects.map((e) => <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </Collapsible>}

          {supports("responsive") && <Collapsible title="Responsive">
            <div className="text-[10px] text-muted-foreground -mt-1">Quickly hide this element per device, independent of the breakpoint tab above.</div>
            {([
              { bp: "desktop" as Bp, label: "Hide on desktop", map: theme.element_styles },
              { bp: "tablet" as Bp, label: "Hide on tablet", map: theme.element_styles_tablet ?? {} },
              { bp: "mobile" as Bp, label: "Hide on mobile", map: theme.element_styles_mobile ?? {} },
            ]).map((row) => (
              <div key={row.bp} className="flex items-center justify-between rounded-md border border-border p-2">
                <Label className="text-[10px]">{row.label}</Label>
                <Switch
                  checked={!!(row.map as any)?.[id]?.hidden}
                  onCheckedChange={(v) => onChangeStyleAtBp(row.bp, { hidden: v })}
                />
              </div>
            ))}
          </Collapsible>}

          {(supports("appearance") || supports("layout")) && <Collapsible title="Custom CSS">
            <Label className="text-[10px]">Custom CSS JSON</Label>
            <Textarea
              rows={2}
              className="text-xs resize-none min-h-[48px] font-mono"
              placeholder='{"backdropFilter":"blur(12px)"}'
              value={style.customCss ? JSON.stringify(style.customCss) : ""}
              onChange={(e) => {
                try {
                  onChange({ customCss: e.target.value.trim() ? JSON.parse(e.target.value) : undefined });
                } catch {
                  onToast({ title: "Invalid CSS JSON", description: "Use a JSON object with camelCase CSS keys.", variant: "destructive" });
                }
              }}
            />
          </Collapsible>}

          {supports("responsive") && <div className="flex items-center justify-between rounded-md border border-border p-2">
            <Label className="text-[10px]">Hide this element ({bp})</Label>
            <Switch checked={!!style.hidden} onCheckedChange={(v) => onChange({ hidden: v })} />
          </div>}
        </div>
      )}

      {activeTab === "advanced" && (
        <div className="space-y-2">
          <Collapsible title="Size" defaultOpen>
            <div className="grid grid-cols-2 gap-2">
              <TextPropertyEditor label="Width" placeholder="auto / 100% / 320px" value={style.width} onCommit={(value) => onChange({ width: value || undefined })} />
              <TextPropertyEditor label="Height" placeholder="auto / 280px" value={style.height} onCommit={(value) => onChange({ height: value || undefined })} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <TextPropertyEditor label="Max width" placeholder="960px" value={style.maxWidth} onCommit={(value) => onChange({ maxWidth: value || undefined })} />
              <TextPropertyEditor label="Min width" placeholder="0" value={style.minWidth} onCommit={(value) => onChange({ minWidth: value || undefined })} />
              <TextPropertyEditor label="Min height" placeholder="120px" value={style.minHeight} onCommit={(value) => onChange({ minHeight: value || undefined })} />
            </div>
          </Collapsible>

          <Collapsible title="Layout">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Display</Label>
                <Input className="h-7 text-xs" placeholder="flex / grid / block" value={style.display ?? ""} onChange={(e) => onChange({ display: e.target.value || undefined })} />
              </div>
              <div>
                <Label className="text-[10px]">Position</Label>
                <Select value={style.position ?? "static"} onValueChange={(v: any) => onChange({ position: v })}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="static">Static</SelectItem>
                    <SelectItem value="relative">Relative</SelectItem>
                    <SelectItem value="absolute">Absolute</SelectItem>
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="sticky">Sticky</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(["top", "right", "bottom", "left"] as const).map((edge) => (
                <div key={edge}>
                  <Label className="text-[10px] capitalize">{edge}</Label>
                  <Input className="h-7 text-[10px]" placeholder="auto" value={(style as any)[edge] ?? ""} onChange={(e) => onChange({ [edge]: e.target.value || undefined } as any)} />
                </div>
              ))}
            </div>
            <div>
              <Label className="text-[10px]">Align to page</Label>
              <div className="flex items-center gap-1 mt-1">
                <button onClick={() => onAlignPage("left")} className="h-7 w-7 grid place-items-center rounded border border-border hover:bg-muted"><AlignLeft size={12} /></button>
                <button onClick={() => onAlignPage("center")} className="h-7 w-7 grid place-items-center rounded border border-border hover:bg-muted"><AlignCenter size={12} /></button>
                <button onClick={() => onAlignPage("right")} className="h-7 w-7 grid place-items-center rounded border border-border hover:bg-muted"><AlignRight size={12} /></button>
              </div>
            </div>
          </Collapsible>

          <Collapsible title="Layer">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onBringFront}><ArrowUpToLine size={12} className="mr-1" /> Front</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onSendBack}><ArrowDownToLine size={12} className="mr-1" /> Back</Button>
            </div>
            <div>
              <Label className="text-[10px]">Z index</Label>
              <Input type="number" className="h-7 text-xs" value={style.zIndex ?? ""} onChange={(e) => onChange({ zIndex: e.target.value === "" ? undefined : Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-[10px]">Opacity {style.opacity ?? 1}</Label>
              <Slider value={[style.opacity ?? 1]} min={0} max={1} step={0.05} onValueChange={([v]) => onChange({ opacity: v })} />
            </div>
          </Collapsible>

          <Collapsible title="Motion">
            <div>
              <Label className="text-[10px]">Transform</Label>
              <Input className="h-7 text-xs" placeholder="translateY(-4px) scale(1.02)" value={style.transform ?? ""} onChange={(e) => onChange({ transform: e.target.value || undefined })} />
            </div>
            <div>
              <Label className="text-[10px]">Transition</Label>
              <Input className="h-7 text-xs" placeholder="all .2s ease" value={style.transition ?? ""} onChange={(e) => onChange({ transition: e.target.value || undefined })} />
            </div>
          </Collapsible>
        </div>
      )}

      {activeTab === "interactions" && (
        <div className="space-y-2">
          {(isLikelyButton || existingLink) && (
            <LinkEditor id={id} link={existingLink} onChange={onChangeLink} items={items} />
          )}
          <Collapsible title="Hover state" defaultOpen>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Hover bg</Label>
                <Input type="color" value={style.hoverBg ?? "#ffffff"} onChange={(e) => onChange({ hoverBg: e.target.value })} className="h-7 p-0.5" />
              </div>
              <div>
                <Label className="text-[10px]">Hover text</Label>
                <Input type="color" value={style.hoverColor ?? "#000000"} onChange={(e) => onChange({ hoverColor: e.target.value })} className="h-7 p-0.5" />
              </div>
            </div>
          </Collapsible>
          <Collapsible title="Notes / comment" defaultOpen>
            <div className="text-[10px] text-muted-foreground -mt-1">Private note for your team — not shown on the live store, not saved to the database yet.</div>
            <Textarea
              rows={2}
              className="text-xs resize-none min-h-[48px]"
              placeholder="Leave a note about this element…"
              value={note}
              onChange={(e) => onChangeNote(e.target.value)}
            />
          </Collapsible>
        </div>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-border">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onClearStyle(bp)}>
          <RotateCcw size={11} className="mr-1" /> Reset {bp}
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={onClose}>Done</Button>
      </div>
    </aside>
  );
};

// ============ Link editor ============
const LinkEditor = ({
  id, link, onChange, items,
}: {
  id: string;
  link?: import("@/lib/storeTheme").ElementLink;
  onChange: (link: import("@/lib/storeTheme").ElementLink | null) => void;
  items: any[];
}) => {
  const current = link ?? { kind: "url" as const, value: "", target: "_self" as const };
  const kinds: { id: import("@/lib/storeTheme").LinkKind; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "product", label: "Product" },
    { id: "collection", label: "Collection / category" },
    { id: "cart", label: "Cart" },
    { id: "checkout", label: "Checkout" },
    { id: "url", label: "External URL" },
    { id: "email", label: "Email" },
    { id: "phone", label: "Phone" },
    { id: "anchor", label: "Anchor on page" },
  ];
  const needsValue = current.kind !== "home" && current.kind !== "cart" && current.kind !== "checkout";
  const placeholder =
    current.kind === "email" ? "hello@brand.com"
    : current.kind === "phone" ? "+1 555 123 4567"
    : current.kind === "anchor" ? "#about"
    : current.kind === "product" || current.kind === "collection" ? "id or slug"
    : "https://…";
  return (
    <div className="rounded-lg border border-border p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <ExternalLink size={11} /> Link
        </div>
        {link && (
          <button onClick={() => onChange(null)} className="text-[10px] text-muted-foreground hover:text-destructive">
            Clear
          </button>
        )}
      </div>
      <Select value={current.kind} onValueChange={(v: any) => onChange({ ...current, kind: v })}>
        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {kinds.map((k) => <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {needsValue && (
        current.kind === "product" ? (
          <Select value={current.value} onValueChange={(v) => onChange({ ...current, value: v })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Choose product" /></SelectTrigger>
            <SelectContent>
              {items.map((it) => <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Input
            className="h-7 text-xs"
            placeholder={placeholder}
            value={current.value}
            onChange={(e) => onChange({ ...current, value: e.target.value })}
          />
        )
      )}
      <label className="flex items-center gap-2 text-[11px] text-muted-foreground pt-0.5">
        <input
          type="checkbox"
          checked={current.target === "_blank"}
          onChange={(e) => onChange({ ...current, target: e.target.checked ? "_blank" : "_self" })}
        />
        Open in new tab
      </label>
    </div>
  );
};

