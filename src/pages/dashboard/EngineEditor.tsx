import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import {
  ArrowLeft,
  Code2,
  Eye,
  LayoutTemplate,
  Layers,
  Plus,
  PanelRightOpen,
  Redo2,
  Save,
  Square,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  StorefrontRevisionConflictError,
  type StorefrontPublishingService,
  type StorefrontWriteResult,
} from "@/platform/publishing";
import {
  DocumentMigrationError,
  type EditorDocumentMigrationSystem,
} from "@/engine/migration";
import {
  type EditorRecoverySystem,
  type RevisionConflictRecord,
  type StartupRecoveryCandidate,
} from "@/persistence/recovery";
import type { EditorStoreDataService } from "@/platform/editor-data";
import type { StorefrontDataResolver } from "@/storefront/data-resolvers";
import { createSceneNode } from "@/engine/scene-graph";
import {
  type AssetManager,
  type AssetSystem,
  type ImageAssetRecord,
} from "@/assets/system";
import {
  createDeleteCommand,
  createFieldUpdateCommand,
  createInsertCommand,
  createSceneReplaceCommand,
  type Command,
  type CommandManager,
} from "@/engine/command";
import type { HistoryManager } from "@/engine/history";
import type { NodeSchemaRegistry } from "@/engine/node-schema";
import type { TransactionManager } from "@/engine/transaction";
import {
  EDITOR_SYSTEM_KEYS,
  useEditorStores,
  useEngineCanvasStore,
  useEngineContext,
  useEngineResponsiveStore,
  useEngineSceneStore,
  useEngineSelectionStore,
  useEngineToolStore,
  useEngineViewportStore,
} from "@/engine/kernel";
import {
  ENGINE_SCENE_TEMPLATES,
  buildBasicCustomPageScene,
  buildBasicTemplateScene,
  getEngineSceneTemplateId,
  loadEngineTemplateScene,
  preloadEngineTemplatePackages,
  reconcileEngineTemplateScene,
  type EngineSceneTemplateId,
} from "@/editor/engine/engineTemplates";
import {
  buildStoreSceneTree,
  createEngineSceneTheme,
  getRequiredEngineScene,
  type StoreSceneItem,
  type StoreSceneProfile,
} from "@/editor/engine/storeSceneAdapter";
import { SceneRenderErrorBoundary } from "@/infrastructure/error-boundary";
import type { CanvasSystem } from "@/rendering/canvas";
import type { ViewportSystem } from "@/rendering/viewport";
import type { SelectionSystem } from "@/interaction/selection";
import type { TransformSystem } from "@/interaction/transform";
import {
  type EditorCapability,
  type EditorMode,
  type EditorModeSystemAPI,
} from "@/interaction/modes";
import { canDeleteCanvasSelection, isCanvasFocusActive, isTypingTarget } from "@/interaction/keyboard";
import type { ToolSystem } from "@/interaction/tools";
import type {
  ResponsiveDiagnostic,
  ResponsiveDiagnosticsSystem,
} from "@/layout/diagnostics";
import type { LayoutEngine } from "@/layout/engine";
import type { ResponsiveSystem } from "@/layout/responsive";
import { type StructuredLayoutSystem } from "@/layout/structured";
import {
  createBlockPresetNodes,
  createSectionPresetNodes,
  type SectionRegistry,
  type SectionDefinition,
  type SettingDefinition,
} from "@/document/sections";
import {
  pageSlug,
  type PreparedPageTransition,
  type PageDocumentSnapshot,
  type PageDocumentSystem,
} from "@/document/pages";
import type { ComponentSystemAPI } from "@/document/components";
import { createProductReferenceChanges } from "@/document/dynamic-sources";
import {
  CUSTOM_CODE_NODE_TYPE,
  createDefaultCustomCodeProps,
} from "@/extension/custom-code";
import { type NavigationSystem } from "@/content/menus";
import {
  type ThemeChromeSystem,
  type ThemeChromeSettings,
  type ThemeLogoAssetSlot,
} from "@/theme-engine/chrome";
import {
  type ThemeBrandingSettings,
  type ThemeBrandingSystem,
} from "@/theme-engine/branding";
import { ThemePolicyViolationError } from "@/themes/governance";
import {
  editorSessionCache,
  type EditorWarmSession,
} from "@/persistence/project-save-load";
import type { SceneGraphAPI } from "@/engine/scene-graph";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import { CanvasShell } from "@/ui/canvas-shell/CanvasShell";
import { SelectionContextToolbar } from "@/ui/canvas-shell/SelectionContextToolbar";
import { EngineInspectorPanel } from "@/ui/inspector-panel/EngineInspectorPanel";
import { EditorRail, type EditorSidebarPanel } from "@/ui/sidebar/EditorRail";
import { ThemeBrandingPanel } from "@/ui/sidebar/ThemeBrandingPanel";
import { ComponentLibraryPanel } from "@/ui/sidebar/ComponentLibraryPanel";
import {
  EngineTemplatePanel,
  type EditorPublicationRecoveryPoint,
} from "@/ui/sidebar/EngineTemplatePanel";
import { StructuredLayerTree } from "@/ui/sidebar/StructuredLayerTree";
import { CanvasToolDock, type ShapePreset, type TextPreset } from "@/ui/toolbar/CanvasToolDock";
import { BreakpointSwitcher } from "@/ui/toolbar/BreakpointSwitcher";
import { EditorModeSwitcher } from "@/ui/toolbar/EditorModeSwitcher";
import { EditorRecoveryDialogs } from "@/ui/recovery/EditorRecoveryDialogs";
import type { LayoutData, NodeId, SceneNode, SceneTree, TransformData } from "@/types";

const cloneTree = (tree: SceneTree): SceneTree => JSON.parse(JSON.stringify(tree)) as SceneTree;
const cloneNode = (node: SceneNode): SceneNode => JSON.parse(JSON.stringify(node)) as SceneNode;
const scheduleFitToWidth = (viewport: ViewportSystem, rootNodeId: NodeId | null) => {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => viewport.fitToWidth(rootNodeId ? [rootNodeId] : undefined));
  });
};
type EditorSaveStatus =
  | "saved"
  | "unsaved"
  | "saving"
  | "failed"
  | "published"
  | "publish-blocked";
type SectionInsertMode = "page-end" | "before" | "after" | "inside";
type ConnectedCanvasToolDockProps = Omit<
  ComponentProps<typeof CanvasToolDock>,
  "zoom" | "onZoomOut" | "onZoomIn"
>;

const ConnectedCanvasToolDock = (props: ConnectedCanvasToolDockProps) => {
  const engine = useEngineContext();
  const viewport = engine.resolveSystem<ViewportSystem>(EDITOR_SYSTEM_KEYS.viewport);
  const zoom = useEngineViewportStore((state) => state.zoom);
  return (
    <CanvasToolDock
      {...props}
      zoom={zoom}
      onZoomOut={() => viewport.zoomTo(zoom - 0.1)}
      onZoomIn={() => viewport.zoomTo(zoom + 0.1)}
    />
  );
};

type ThemeColorToken =
  | "primary"
  | "secondary"
  | "background"
  | "surface"
  | "text"
  | "mutedText"
  | "border"
  | "success"
  | "warning"
  | "error";

const sceneBackground = (scene: SceneTree): string => {
  const root = scene.rootNodeId ? scene.nodes[scene.rootNodeId] : undefined;
  const canvasBackground = root?.extensions?.canvasBackground;
  if (typeof canvasBackground === "string") return canvasBackground;
  const fill = root?.style.fills[0];
  if (fill?.type === "solid") return fill.color;
  if (fill?.type === "gradient") return fill.value;
  return "#f1f5f9";
};

const sceneNodes = (nodes: Record<NodeId, SceneNode>, rootNodeId: NodeId | null): SceneNode[] => {
  if (!rootNodeId || !nodes[rootNodeId]) return [];
  const out: SceneNode[] = [];
  const visit = (nodeId: NodeId, depth: number) => {
    const node = nodes[nodeId];
    if (!node) return;
    out.push({ ...node, extensions: { ...(node.extensions ?? {}), layerDepth: depth } });
    node.childIds.forEach((childId) => visit(childId, depth + 1));
  };
  visit(rootNodeId, 0);
  return out;
};

const duplicateSubtree = (
  source: SceneNode,
  allNodes: Record<NodeId, SceneNode>,
  parentId: NodeId,
  offset = 24,
): SceneNode[] => {
  const idMap = new Map<NodeId, NodeId>();
  const createId = (id: NodeId) => {
    const next = `${id}-copy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    idMap.set(id, next);
    return next;
  };
  const clone = (node: SceneNode, nextParentId: NodeId): SceneNode[] => {
    const nextId = idMap.get(node.id) ?? createId(node.id);
    const children = node.childIds.map((childId) => allNodes[childId]).filter((child): child is SceneNode => Boolean(child));
    const clonedChildren = children.flatMap((child) => clone(child, nextId));
    const clonedNode: SceneNode = {
      ...cloneNode(node),
      id: nextId,
      name: `${node.name} copy`,
      parentId: nextParentId,
      childIds: children.map((child) => idMap.get(child.id) ?? createId(child.id)),
      transform: { ...node.transform, x: node.transform.x + offset, y: node.transform.y + offset },
      meta: { ...node.meta, createdAt: Date.now(), updatedAt: Date.now() },
    };
    return [clonedNode, ...clonedChildren];
  };
  return clone(source, parentId);
};

type ActiveEditorWarmSession = EditorWarmSession<
  StoreSceneProfile,
  StoreSceneItem,
  PageDocumentSnapshot
>;

export type EngineEditorProps = {
  initialSession?: EditorWarmSession | null;
  headerActions?: ReactNode;
};

const EngineEditor = ({ initialSession = null, headerActions = null }: EngineEditorProps) => {
  const { user, currentStore, refreshAuthorization } = useAuth();
  const activeStoreId = currentStore?.id ?? user?.id ?? null;
  const warmSession =
    initialSession && initialSession.storeId === activeStoreId
      ? initialSession as ActiveEditorWarmSession
      : null;
  const initialWarmSessionRef = useRef<ActiveEditorWarmSession | null>(warmSession);
  const currentWarmSessionRef = useRef<ActiveEditorWarmSession | null>(warmSession);
  const engine = useEngineContext();
  const editorStores = useEditorStores();
  const { toast } = useToast();
  const [loading, setLoading] = useState(!warmSession);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<EditorSaveStatus>(
    warmSession?.dirty ? "unsaved" : "saved",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<StoreSceneProfile | null>(warmSession?.profile ?? null);
  const [storeItems, setStoreItems] = useState<StoreSceneItem[]>(
    warmSession ? [...warmSession.storeItems] : [],
  );
  const [storeSlug, setStoreSlug] = useState(warmSession?.storeSlug ?? "");
  const [clipboard, setClipboard] = useState<SceneNode[] | null>(null);
  const [leftPanel, setLeftPanel] = useState<EditorSidebarPanel>("templates");
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const [inspectorDrawerOpen, setInspectorDrawerOpen] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] =
    useState<EngineSceneTemplateId | null>(null);
  const [sectionSearch, setSectionSearch] = useState("");
  const [sectionCategory, setSectionCategory] = useState<SectionDefinition["category"] | "All">("All");
  const [sectionInsertMode, setSectionInsertMode] =
    useState<SectionInsertMode>("page-end");
  const [sectionActionError, setSectionActionError] =
    useState<string | null>(null);
  const [pageSnapshot, setPageSnapshot] = useState<PageDocumentSnapshot | null>(
    warmSession?.pageSnapshot ?? null,
  );
  const [addingPage, setAddingPage] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [recoveryPoints, setRecoveryPoints] = useState<EditorPublicationRecoveryPoint[]>([]);
  const [restoringRecoveryPointId, setRestoringRecoveryPointId] = useState<string | null>(null);
  const [startupRecovery, setStartupRecovery] = useState<StartupRecoveryCandidate | null>(null);
  const [showRecoveryDifferences, setShowRecoveryDifferences] = useState(false);
  const [revisionConflict, setRevisionConflict] = useState<RevisionConflictRecord | null>(null);
  const commandGraph = engine.resolveSystem<SceneGraphAPI>(EDITOR_SYSTEM_KEYS.commandSceneGraph);
  const commandManager = engine.resolveSystem<CommandManager>(EDITOR_SYSTEM_KEYS.commands);
  const historyManager = engine.resolveSystem<HistoryManager>(EDITOR_SYSTEM_KEYS.history);
  const nodeSchemas = engine.resolveSystem<NodeSchemaRegistry>(EDITOR_SYSTEM_KEYS.nodeSchemas);
  const migrations = engine.resolveSystem<EditorDocumentMigrationSystem>(EDITOR_SYSTEM_KEYS.migrations);
  const recovery = engine.resolveSystem<EditorRecoverySystem>(EDITOR_SYSTEM_KEYS.recovery);
  const transactions = engine.resolveSystem<TransactionManager>(EDITOR_SYSTEM_KEYS.transactions);
  const canvas = engine.resolveSystem<CanvasSystem>(EDITOR_SYSTEM_KEYS.canvas);
  const viewport = engine.resolveSystem<ViewportSystem>(EDITOR_SYSTEM_KEYS.viewport);
  const selection = engine.resolveSystem<SelectionSystem>(EDITOR_SYSTEM_KEYS.selection);
  const editorModeSystem = engine.resolveSystem<EditorModeSystemAPI>(EDITOR_SYSTEM_KEYS.editorMode);
  const transformSystem = engine.resolveSystem<TransformSystem>(EDITOR_SYSTEM_KEYS.transform);
  const tools = engine.resolveSystem<ToolSystem>(EDITOR_SYSTEM_KEYS.tools);
  const responsive = engine.resolveSystem<ResponsiveSystem>(EDITOR_SYSTEM_KEYS.responsive);
  const layoutEngine = engine.resolveSystem<LayoutEngine>(EDITOR_SYSTEM_KEYS.layoutEngine);
  const responsiveDiagnostics = engine.resolveSystem<ResponsiveDiagnosticsSystem>(
    EDITOR_SYSTEM_KEYS.responsiveDiagnostics,
  );
  const structuredLayout = engine.resolveSystem<StructuredLayoutSystem>(EDITOR_SYSTEM_KEYS.structuredLayout);
  const sections = engine.resolveSystem<SectionRegistry>(EDITOR_SYSTEM_KEYS.sections);
  const pages = engine.resolveSystem<PageDocumentSystem>(EDITOR_SYSTEM_KEYS.pages);
  const components = engine.resolveSystem<ComponentSystemAPI>(EDITOR_SYSTEM_KEYS.components);
  const assets = engine.resolveSystem<AssetSystem>(EDITOR_SYSTEM_KEYS.assets);
  const assetManager = engine.resolveSystem<AssetManager>(EDITOR_SYSTEM_KEYS.assetManager);
  const navigation = engine.resolveSystem<NavigationSystem>(EDITOR_SYSTEM_KEYS.navigation);
  const publishingService = engine.resolveSystem<StorefrontPublishingService>(EDITOR_SYSTEM_KEYS.publishing);
  const editorData = engine.resolveSystem<EditorStoreDataService>(EDITOR_SYSTEM_KEYS.editorData);
  const storefrontData = engine.resolveSystem<StorefrontDataResolver>(EDITOR_SYSTEM_KEYS.storefrontData);
  const themeChrome = engine.resolveSystem<ThemeChromeSystem>(EDITOR_SYSTEM_KEYS.themeChrome);
  const themeBranding = engine.resolveSystem<ThemeBrandingSystem>(EDITOR_SYSTEM_KEYS.themeBranding);

  const rootNodeId = useEngineSceneStore((state) => state.rootNodeId);
  const nodes = useEngineSceneStore((state) => state.nodes);
  const componentLibrary = useEngineSceneStore((state) => state.components);
  const sceneRevision = useEngineSceneStore((state) => state.revision);
  const selectedIds = useEngineSelectionStore((state) => state.selectedIds);
  const activeBreakpoint = useEngineResponsiveStore((state) => state.activeBreakpoint);
  const activeTool = useEngineToolStore((state) => state.activeTool);
  const gridVisible = useEngineCanvasStore((state) => state.gridVisible);
  const rulerVisible = useEngineCanvasStore((state) => state.rulerVisible);
  const guideCount = useEngineCanvasStore((state) => state.guides.length);
  const liveScene = useMemo<SceneTree>(() => ({
    rootNodeId,
    nodes,
    ...(componentLibrary ? { components: componentLibrary } : {}),
  }), [componentLibrary, nodes, rootNodeId]);
  const historySnapshot = useSyncExternalStore(
    historyManager.subscribe,
    historyManager.getSnapshot,
    historyManager.getSnapshot,
  );
  const editorMode = useSyncExternalStore(
    editorModeSystem.subscribe,
    editorModeSystem.getSnapshot,
    editorModeSystem.getSnapshot,
  );
  const { canUndo, canRedo } = historySnapshot;
  const selectedNodeId = selectedIds[selectedIds.length - 1] ?? null;
  const selectedNode = selectedNodeId ? nodes[selectedNodeId] : null;
  const independentEditing = editorMode === "independent";
  const canUseEditorCapability = (
    capability: EditorCapability,
    node: SceneNode | null = selectedNode,
  ) => editorModeSystem.can(capability, node);
  const selectedParent = selectedNode?.parentId ? nodes[selectedNode.parentId] : null;
  const sceneWidths = useMemo(
    () => responsive.getSceneWidths(liveScene),
    [liveScene, responsive],
  );
  const activeTemplateId = useMemo(
    () => getEngineSceneTemplateId(liveScene),
    [liveScene],
  );
  const activePage = pageSnapshot?.document.pages.find(
    (page) => page.id === pageSnapshot.activePageId,
  );
  const hasCustomPages =
    pageSnapshot?.document.pages.some((page) => page.kind === "custom") ?? false;
  const themeApplicationBlockedReason =
    !activePage || activePage.kind !== "home" || hasCustomPages
      ? "The current theme package cannot migrate every page safely while this store has custom pages, so nothing was changed."
      : null;
  const activeStorePath = storeSlug
    ? activePage?.kind === "custom"
      ? `/store/${storeSlug}/pages/${activePage.slug}`
      : `/store/${storeSlug}`
    : "";
  const activePreviewPath = activePage?.kind === "custom"
    ? `/dashboard/store/preview?page=custom&pageSlug=${encodeURIComponent(activePage.slug)}`
    : "/dashboard/store/preview";
  useEffect(() => {
    assetManager.setStoreContext(currentStore?.id ?? user?.id ?? null);
    return () => assetManager.setStoreContext(null);
  }, [assetManager, currentStore?.id, user?.id]);
  const structuredScene = Boolean(rootNodeId && nodes[rootNodeId]?.extensions?.structuredPage === true);
  const themeChromeSettings = useMemo(
    () => themeChrome.getSettings(liveScene),
    [liveScene, themeChrome],
  );
  const brandingRoot = rootNodeId ? nodes[rootNodeId] : undefined;
  const themeBrandingSettings = useMemo(
    () => themeBranding.getSettings(liveScene),
    [brandingRoot?.extensions?.designTokens, brandingRoot?.extensions?.themeBranding, themeBranding],
  );
  const appliedThemeBranding = useMemo(
    () => themeBranding.getAppliedSettings(liveScene),
    [brandingRoot?.extensions?.themeBranding, themeBranding],
  );
  const layers = useMemo(() => {
    const ordered = sceneNodes(nodes, rootNodeId);
    return structuredScene ? ordered : ordered.reverse();
  }, [nodes, rootNodeId, structuredScene]);
  const displayedLayers = useMemo(
    () =>
      structuredScene
        ? layers.filter((node) => ["page", "section", "block"].includes(String(node.extensions?.editorKind)))
        : layers,
    [layers, structuredScene],
  );
  const sectionLibrary = useMemo(
    () => sections.searchSections(sectionSearch, sectionCategory === "All" ? undefined : sectionCategory),
    [sectionCategory, sectionSearch, sections],
  );
  const componentDefinitions = useMemo(
    () => Object.values(componentLibrary?.definitions ?? {}).sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    [componentLibrary],
  );
  const editorDynamicSourceData = useMemo(
    () => ({
      products: storeItems
        .filter((item): item is StoreSceneItem & { id: string | number } => item.id !== null && item.id !== undefined),
      store: {
        name: profile?.business_name,
        tagline: profile?.store_tagline,
        about: profile?.store_about,
      },
    }),
    [profile?.business_name, profile?.store_about, profile?.store_tagline, storeItems],
  );
  const designTokenColors = useMemo(() => {
    const root = rootNodeId ? nodes[rootNodeId] : null;
    const designTokens = root?.extensions?.designTokens;
    const colors =
      designTokens && typeof designTokens === "object"
        ? (designTokens as { colors?: Record<string, unknown> }).colors
        : undefined;
    return {
      primary: String(colors?.primary ?? profile?.store_color ?? "#2f5f4a"),
      secondary: String(colors?.secondary ?? "#171717"),
      background: String(colors?.background ?? "#ffffff"),
      surface: String(colors?.surface ?? "#f3f1eb"),
      text: String(colors?.text ?? "#171717"),
      mutedText: String(colors?.mutedText ?? "#666666"),
      border: String(colors?.border ?? "#deded9"),
      success: String(colors?.success ?? "#16845b"),
      warning: String(colors?.warning ?? "#b66a00"),
      error: String(colors?.error ?? "#c93b3b"),
    };
  }, [nodes, profile?.store_color, rootNodeId]);
  const latestSceneRef = useRef<SceneTree | null>(null);
  const lastPersistedRevisionRef = useRef(
    warmSession?.dirty ? -1 : editorStores.scene.getState().revision,
  );
  const canvasPanelRef = useRef<HTMLElement>(null);
  const pageTransitionActiveRef = useRef(false);
  const warmBootstrappedRef = useRef(false);
  const syncCanvasToScene = useCallback(
    (
      scene: SceneTree,
      breakpoint: ResponsiveBreakpoint = activeBreakpoint,
      fit = true,
    ) => {
      const modeRoot = scene.rootNodeId
        ? responsive.resolveNode(scene.nodes[scene.rootNodeId], breakpoint)
        : null;
      canvas.setCanvasSize({
        width: responsive.getSceneWidth(scene, breakpoint),
        height: Math.max(1, modeRoot?.transform.height ?? 1760),
      });
      canvas.setBackground(sceneBackground(scene));
      if (fit) scheduleFitToWidth(viewport, scene.rootNodeId);
    },
    [activeBreakpoint, canvas, responsive, viewport],
  );
  const buildVersionedDocument = useCallback(
    (scene = commandGraph.serializeTree()) => {
      const pageDocument = pages.serialize(scene);
      return migrations.migrate(
        createEngineSceneTheme(scene, pageDocument) as Record<string, unknown>,
      );
    },
    [commandGraph, migrations, pages],
  );
  const refreshPublicationRecovery = useCallback(async () => {
    const sessionPoints: EditorPublicationRecoveryPoint[] = publishingService
      .listRecoveryPoints()
      .map((point) => ({
        id: `session:${point.id}`,
        sourceId: point.id,
        source: "session" as const,
        revision: point.revision,
        createdAt: point.createdAt,
        label: point.reason === "loaded-publication" ? "Loaded publication" : "Before publish",
      }));
    let serverPoints: EditorPublicationRecoveryPoint[] = [];
    try {
      serverPoints = (await publishingService.listPersistedPublications(20)).map((point) => ({
        id: `server:${point.id}`,
        sourceId: point.id,
        source: "server" as const,
        revision: point.revision,
        createdAt: point.createdAt,
        label: "Published revision",
      }));
    } catch {
      // Same-session recovery remains available when durable history RPCs are not deployed yet.
    }
    setRecoveryPoints([...serverPoints, ...sessionPoints].sort(
      (left, right) => right.revision - left.revision,
    ));
  }, [publishingService]);

  useLayoutEffect(() => {
    const cached = initialWarmSessionRef.current;
    if (!cached || warmBootstrappedRef.current) return;
    warmBootstrappedRef.current = true;
    pages.restore(cached.pageSnapshot);
    publishingService.initialize(cached.serverRevision, null);
    responsive.activate(cached.activeBreakpoint);
    viewport.zoomTo(cached.viewport.zoom);
    viewport.panTo(cached.viewport.pan);
    syncCanvasToScene(cached.scene, cached.activeBreakpoint, false);
  }, [pages, publishingService, responsive, syncCanvasToScene, viewport]);

  useEffect(
    () =>
      pages.subscribe(() => {
        setPageSnapshot(pages.getSnapshot());
      }),
    [pages],
  );

  useEffect(() => {
    if (!pageSnapshot || loading) return;
    const frame = window.requestAnimationFrame(() => {
      syncCanvasToScene(commandGraph.serializeTree());
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    commandGraph,
    loading,
    pageSnapshot,
    syncCanvasToScene,
  ]);

  useEffect(() => {
    void preloadEngineTemplatePackages().catch(() => {
      // Apply reports package-specific failures; preloading must not block editor startup.
    });
  }, []);

  useEffect(() => {
    if (!selectedNodeId || typeof window === "undefined" || window.innerWidth >= 1280) return;
    setInspectorDrawerOpen(true);
  }, [selectedNodeId]);

  useEffect(() => {
    if (selectedNode?.extensions?.structured === true) setLeftPanel("layers");
  }, [selectedNode?.id, selectedNode?.extensions?.structured]);

  useEffect(() => {
    // Scene store snapshots are immutable. Retaining the current snapshot avoids
    // cloning the complete document after every command while preserving the
    // exact "before" tree required by scene-replacement commands.
    latestSceneRef.current = liveScene;
  }, [liveScene, sceneRevision]);

  useEffect(() => {
    if (!activeStoreId || !profile || !pageSnapshot || !rootNodeId) return;
    const viewportState = editorStores.viewport.getState();
    const session: ActiveEditorWarmSession = {
      storeId: activeStoreId,
      scene: liveScene,
      profile,
      storeItems,
      storeSlug,
      pageSnapshot,
      serverRevision: publishingService.getRevision(),
      dirty:
        sceneRevision !== lastPersistedRevisionRef.current ||
        saveStatus === "unsaved" ||
        saveStatus === "failed",
      activeBreakpoint,
      viewport: {
        zoom: viewportState.zoom,
        pan: viewportState.pan,
      },
      updatedAt: Date.now(),
    };
    currentWarmSessionRef.current = session;
    editorSessionCache.put(session);
  }, [
    activeBreakpoint,
    activeStoreId,
    editorStores.viewport,
    liveScene,
    pageSnapshot,
    profile,
    publishingService,
    rootNodeId,
    saveStatus,
    sceneRevision,
    storeItems,
    storeSlug,
  ]);

  useEffect(() => {
    if (!activeStoreId) return;
    let frame: number | null = null;
    let pendingViewport = editorStores.viewport.getState();
    const persistViewport = () => {
      frame = null;
      const current = currentWarmSessionRef.current;
      if (!current || current.storeId !== activeStoreId) return;
      const next: ActiveEditorWarmSession = {
        ...current,
        viewport: {
          zoom: pendingViewport.zoom,
          pan: pendingViewport.pan,
        },
        updatedAt: Date.now(),
      };
      currentWarmSessionRef.current = next;
      editorSessionCache.put(next);
    };
    const unsubscribe = editorStores.viewport.subscribe((state) => {
      pendingViewport = state;
      if (frame === null) frame = window.requestAnimationFrame(persistViewport);
    });
    return () => {
      unsubscribe();
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
        persistViewport();
      }
    };
  }, [activeStoreId, editorStores.viewport]);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const cached = initialWarmSessionRef.current;
      if (!cached) setLoading(true);
      setLoadError(null);
      try {
        if (!activeStoreId) return;
        const loadedStore = await editorData.load(user, activeStoreId);
        const prof = loadedStore.profile;
        const originalTheme = prof.theme_draft ?? prof.theme;
        const profileShape: StoreSceneProfile = {
          business_name: prof.business_name,
          store_tagline: prof.store_tagline,
          store_about: prof.store_about,
          store_color: prof.store_color,
          store_banner_url: prof.store_banner_url,
          theme: originalTheme,
        };
        setStoreSlug(prof.store_slug ?? "");
        let serverRevision = Number(prof.theme_revision ?? 0);
        publishingService.initialize(
          serverRevision,
          prof.theme_published
            ? { storeId: activeStoreId, document: prof.theme_published }
            : null,
        );
        const storeSceneItems = [...loadedStore.items];
        setStoreItems(storeSceneItems);

        let legacyConverted = false;
        let migrationPersistenceError: unknown = null;
        let candidateDocument: Record<string, unknown>;
        try {
          if (migrations.isEngineDocument(profileShape.theme)) {
            candidateDocument = profileShape.theme;
          } else {
            legacyConverted = true;
            const convertedScene = responsive.ensureSceneOverrides(
              profileShape.theme
                ? buildStoreSceneTree(profileShape, storeSceneItems)
                : buildBasicTemplateScene(profileShape, storeSceneItems),
            );
            candidateDocument = createEngineSceneTheme(convertedScene) as Record<string, unknown>;
          }
          const migrationResult = migrations.migrate(candidateDocument);
          if (migrationResult.report.steps.length) {
            await recovery.captureMigration(
              activeStoreId,
              legacyConverted && originalTheme && typeof originalTheme === "object"
                ? { ...migrationResult, backup: structuredClone(originalTheme) as Record<string, unknown> }
                : migrationResult,
            );
          }
          const changed =
            legacyConverted ||
            JSON.stringify(migrationResult.document) !== JSON.stringify(candidateDocument);
          candidateDocument = migrationResult.document;
          profileShape.theme = candidateDocument;
          if (changed) {
            try {
              const result = await publishingService.saveDraft({
                storeId: activeStoreId,
                userId: user.id,
                document: candidateDocument,
                storeColor: profileShape.store_color ?? null,
                context: {
                  productIds: storeSceneItems
                    .map((item) => item.id)
                    .filter((id): id is string | number => id !== null && id !== undefined),
                },
              });
              serverRevision = result.revision;
            } catch (migrationError) {
              migrationPersistenceError = migrationError;
            }
          }
        } catch (migrationError) {
          if (migrationError instanceof DocumentMigrationError) {
            await recovery.captureMigrationFailure(
              activeStoreId,
              migrationError as DocumentMigrationError<Record<string, unknown>>,
            );
          }
          throw migrationError;
        }

        const preferWarmSession = Boolean(
          cached &&
          (cached.dirty || cached.serverRevision >= serverRevision),
        );
        setProfile(preferWarmSession ? { ...profileShape, ...cached?.profile, theme: profileShape.theme } : { ...profileShape });
        let scene: SceneTree;
        let reconciled = false;
        if (preferWarmSession && cached) {
          pages.restore(cached.pageSnapshot);
          setPageSnapshot(cached.pageSnapshot);
          scene = cached.scene;
          if (!commandGraph.serializeTree().rootNodeId) commandGraph.deserializeTree(scene);
        } else {
          scene = getRequiredEngineScene(profileShape.theme, "Current store profile");
          const loadedPages = pages.load(profileShape.theme, scene);
          setPageSnapshot(loadedPages);
          scene =
            loadedPages.document.pages.find((page) => page.id === loadedPages.activePageId)?.scene ??
            scene;
          const beforeReconciliation = JSON.stringify(scene);
          scene = await reconcileEngineTemplateScene(
            scene,
            profileShape,
            storeSceneItems,
          );
          scene = responsive.ensureSceneOverrides(scene);
          if (structuredLayout.isStructuredScene(scene)) scene = structuredLayout.reflowScene(scene);
          reconciled = beforeReconciliation !== JSON.stringify(scene);
          commandGraph.deserializeTree(scene);
        }
        const currentSceneRevision = editorStores.scene.getState().revision;
        lastPersistedRevisionRef.current = cached?.dirty || reconciled || migrationPersistenceError
          ? -1
          : currentSceneRevision;

        const startupCandidate = await recovery.startSession({
          storeId: activeStoreId,
          serverRevision,
          serverDocument: candidateDocument,
          getCurrentDocument: () => {
            const current = buildVersionedDocument();
            return {
              document: current.document,
              localRevision: editorStores.scene.getState().revision,
            };
          },
          validateDocument: (document) => {
            if (!migrations.isEngineDocument(document)) {
              return { valid: false, issues: ["Recovery document is missing engine_scene."] };
            }
            return migrations.validateCurrent(document);
          },
          getDocumentVersion: (document) => {
            if (!migrations.isEngineDocument(document)) {
              throw new Error("Recovery document is missing engine_scene.");
            }
            return migrations.getVersion(document);
          },
        });
        setStartupRecovery(preferWarmSession ? null : startupCandidate);
        setShowRecoveryDifferences(false);
        const unresolvedConflicts = await recovery.listUnresolvedConflicts(user.id);
        setRevisionConflict(unresolvedConflicts[0] ?? null);

        if (migrationPersistenceError) {
          try {
            await recovery.queueSave(
              "draft",
              candidateDocument,
              serverRevision,
              migrationPersistenceError,
            );
          } catch {
            // Recovery storage reports its own telemetry and must not hide the valid in-memory scene.
          }
          toast({
            title: "Scene opened locally",
            description: `Migration save is queued: ${migrationPersistenceError instanceof Error ? migrationPersistenceError.message : "Unknown persistence error"}`,
            variant: "destructive",
          });
        } else if (legacyConverted) {
          toast({ title: "Store scene migrated", description: "Existing profile data was converted and versioned." });
        }
        setSaveStatus(
          cached?.dirty || reconciled
            ? "unsaved"
            : migrationPersistenceError
              ? "failed"
              : "saved",
        );
        await refreshPublicationRecovery();
        const targetBreakpoint = preferWarmSession && cached
          ? cached.activeBreakpoint
          : "desktop";
        responsive.activate(targetBreakpoint);
        syncCanvasToScene(scene, targetBreakpoint, !preferWarmSession);
        selection.clearSelection();
      } catch (error) {
        if (initialWarmSessionRef.current) {
          setLoadError(null);
          setSaveStatus(initialWarmSessionRef.current.dirty ? "unsaved" : "failed");
        } else {
          const message = error instanceof Error ? error.message : "Could not load the Engine Scene editor.";
          setLoadError(message);
          commandGraph.deserializeTree({ rootNodeId: null, nodes: {} });
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [
    buildVersionedDocument,
    canvas,
    commandGraph,
    editorData,
    editorStores.scene,
    migrations,
    pages,
    publishingService,
    recovery,
    refreshPublicationRecovery,
    responsive,
    selection,
    structuredLayout,
    syncCanvasToScene,
    toast,
    activeStoreId,
    user,
    viewport,
  ]);

  const dispatchCommand = (command: Command) => {
    commandManager.dispatch(command, { sceneGraph: commandGraph });
  };

  const applyTemplate = async (templateId: EngineSceneTemplateId) => {
    if (!profile || applyingTemplateId) return;
    const customPagePresent =
      pageSnapshot?.document.pages.some((page) => page.kind === "custom") ?? false;
    if (!activePage || activePage.kind !== "home" || customPagePresent) {
      toast({
        title: "Theme was not changed",
        description:
          "The current theme package cannot migrate every page safely while this store has custom pages, so nothing was changed.",
      });
      return;
    }
    const template = ENGINE_SCENE_TEMPLATES.find(
      (candidate) => candidate.id === templateId,
    );
    const before = latestSceneRef.current ?? commandGraph.serializeTree();
    setApplyingTemplateId(templateId);
    try {
      const templateScene = await loadEngineTemplateScene(
        templateId,
        profile,
        storeItems,
      );
      const after = responsive.ensureSceneOverrides(templateScene);
      dispatchCommand(
        createSceneReplaceCommand(
          before,
          after,
          `Apply ${template?.name ?? templateId}`,
        ),
      );
      const modeRoot = after.rootNodeId
        ? responsive.resolveNode(after.nodes[after.rootNodeId], activeBreakpoint)
        : null;
      canvas.setCanvasSize({
        width: responsive.getSceneWidth(after, activeBreakpoint),
        height: Math.max(1, modeRoot?.transform.height ?? 1760),
      });
      canvas.setBackground(sceneBackground(after));
      scheduleFitToWidth(viewport, after.rootNodeId);
      selection.clearSelection();
      toast({
        title: `Theme applied to ${activePage.title}`,
        description: `${template?.name ?? templateId} replaced the editable design for ${activePage.title}. Other storefront routes were not changed.`,
      });
    } catch (error) {
      toast({
        title: "Theme could not be applied",
        description:
          error instanceof Error
            ? error.message
            : "The theme package could not create an editor scene.",
        variant: "destructive",
      });
    } finally {
      setApplyingTemplateId(null);
    }
  };

  const updateNodeField = (nodeId: NodeId, field: string, before: unknown, after: unknown) => {
    dispatchCommand(createFieldUpdateCommand(nodeId, field, before, after));
  };

  const updateTransform = (patch: Partial<TransformData>) => {
    if (!selectedNode || !canUseEditorCapability("transform", selectedNode)) return;
    const resolved = responsive.resolveNode(selectedNode, activeBreakpoint);
    const nextLayout = responsive.updateLayout(selectedNode, activeBreakpoint, {
      transform: { ...resolved.transform, ...patch },
      manualTransform: true,
    });
    updateNodeField(selectedNode.id, "layout", selectedNode.layout, nextLayout);
  };

  const updateLayout = (layout: LayoutData) => {
    if (!selectedNode || !canUseEditorCapability("transform", selectedNode)) return;
    const before = cloneTree(liveScene);
    const changed = cloneTree(before);
    changed.nodes[selectedNode.id].layout = layout;
    const after = structuredLayout.isStructuredScene(changed)
      ? structuredLayout.reflowScene(changed)
      : layoutEngine.reflowScene(changed);
    dispatchCommand(
      createSceneReplaceCommand(before, after, `Update ${selectedNode.name} layout`),
    );
  };

  const applyResponsiveDiagnostic = (diagnostic: ResponsiveDiagnostic) => {
    if (!canUseEditorCapability("structure")) return;
    const before = cloneTree(liveScene);
    const fixed = responsiveDiagnostics.applyFix(before, diagnostic);
    const after = structuredLayout.isStructuredScene(fixed)
      ? structuredLayout.reflowScene(fixed)
      : fixed;
    dispatchCommand(
      createSceneReplaceCommand(before, after, `Fix ${diagnostic.code}`),
    );
  };

  const runPreparedPageTransaction = (
    transition: PreparedPageTransition,
    label: string,
    metadata: Record<string, unknown>,
  ) => {
    const beforePage = transition.before.document.pages.find(
      (page) => page.id === transition.before.activePageId,
    );
    if (!beforePage) {
      throw new Error(
        `Storefront page ${transition.before.activePageId} does not exist.`,
      );
    }
    const beforeScene = cloneTree(beforePage.scene);
    const afterScene = cloneTree(transition.scene);
    transactions.run(
      {
        label,
        metadata,
        steps: [
          {
            id: "page-document",
            label: "Update page document",
            execute: () => pages.restore(transition.after),
            rollback: () => pages.restore(transition.before),
          },
          {
            id: "scene-tree",
            label: "Update active page scene",
            execute: ({ sceneGraph }) => sceneGraph.deserializeTree(afterScene),
            rollback: ({ sceneGraph }) => sceneGraph.deserializeTree(beforeScene),
          },
        ],
        validators: [
          {
            id: "node-schema",
            validate: ({ sceneGraph }) => {
              nodeSchemas.assertTree(sceneGraph.serializeTree());
              if (pages.getSnapshot().activePageId !== transition.after.activePageId) {
                throw new Error("Page document and active Scene Graph diverged.");
              }
            },
          },
        ],
      },
      { sceneGraph: commandGraph },
    );
  };

  const commitComponentMutation = (
    label: string,
    mutate: (scene: SceneTree) => SceneTree,
    nextSelectionId?: string,
  ) => {
    if (!canUseEditorCapability("structure")) return;
    try {
      const before = cloneTree(liveScene);
      const changed = mutate(before);
      const after = structuredLayout.isStructuredScene(changed)
        ? structuredLayout.reflowScene(changed)
        : layoutEngine.hasGenericLayout(changed)
          ? layoutEngine.reflowScene(changed)
          : changed;
      const transition = pages.prepareSceneUpdate(before, after);
      components.assertScene(transition.scene);
      runPreparedPageTransaction(transition, label, {
        pageId: transition.after.activePageId,
        operation: "component-mutation",
      });
      if (nextSelectionId && transition.scene.nodes[nextSelectionId]) {
        selection.select([nextSelectionId]);
      }
      setSaveStatus("unsaved");
    } catch (error) {
      toast({
        title: "Component change failed",
        description: error instanceof Error ? error.message : "The component document is invalid.",
        variant: "destructive",
      });
    }
  };

  const createSelectedComponent = () => {
    if (!selectedNode) return;
    commitComponentMutation(
      `Create ${selectedNode.name} component`,
      (scene) => components.createDefinition(scene, selectedNode.id, { name: selectedNode.name }).scene,
      selectedNode.id,
    );
  };

  const updateComponentMaster = (definitionId: string) => {
    const currentPages = pageSnapshot?.document.pages.map((page) => ({
      pageId: page.id,
      scene: page.id === pageSnapshot.activePageId ? liveScene : page.scene,
    })) ?? [{ pageId: "active", scene: liveScene }];
    const impact = components.getImpact(
      definitionId,
      currentPages,
    );
    commitComponentMutation(
      `Update component across ${impact.instanceCount} instance${impact.instanceCount === 1 ? "" : "s"}`,
      (scene) => components.updateDefinition(scene, definitionId).scene,
      selectedNode?.id,
    );
  };

  const createComponentVariant = (definitionId: string, name: string) => {
    if (!selectedNode) return;
    commitComponentMutation(
      `Create ${name} variant`,
      (scene) => components.createVariant(scene, definitionId, selectedNode.id, { name }).scene,
      selectedNode.id,
    );
  };

  const createComponentInstance = (definitionId: string) => {
    if (!selectedNode?.parentId) return;
    let createdId: string | undefined;
    commitComponentMutation(
      `Create ${selectedNode.name} instance`,
      (scene) => {
        const result = components.instantiate(scene, definitionId, selectedNode.parentId as string, {
          x: selectedNode.transform.x + 24,
          y: selectedNode.transform.y + 24,
          zIndex: selectedNode.transform.zIndex + 1,
        });
        createdId = result.instanceRootId;
        return result.scene;
      },
    );
    if (createdId) selection.select([createdId]);
  };

  const insertComponentFromLibrary = (definitionId: string) => {
    const definition = liveScene.components?.definitions[definitionId];
    const variant = definition?.variants[definition.defaultVariantId];
    const sourceRoot = variant?.tree.nodes[variant.tree.rootNodeId];
    if (!definition || !sourceRoot || !rootNodeId) return;
    const candidateIds = [selectedNode?.id, selectedNode?.parentId, rootNodeId]
      .filter((nodeId, index, values): nodeId is string =>
        Boolean(nodeId) && values.indexOf(nodeId) === index,
      );
    const parentId = candidateIds.find((nodeId) => {
      const parent = liveScene.nodes[nodeId];
      return Boolean(
        parent &&
        !parent.meta.locked &&
        nodeSchemas.validateRelationship(parent, sourceRoot).valid,
      );
    });
    if (!parentId) {
      toast({
        title: "Component cannot be inserted here",
        description: "Select an unlocked section or container that accepts this component.",
        variant: "destructive",
      });
      return;
    }
    const parent = liveScene.nodes[parentId];
    const siblings = parent.childIds.map((nodeId) => liveScene.nodes[nodeId]).filter(Boolean);
    const adjacent = selectedNode?.parentId === parentId ? selectedNode : null;
    const x = adjacent ? adjacent.transform.x + 24 : 24;
    const y = adjacent
      ? adjacent.transform.y + 24
      : siblings.reduce(
          (maximum, sibling) => Math.max(maximum, sibling.transform.y + sibling.transform.height),
          0,
        ) + 24;
    const zIndex = siblings.reduce(
      (maximum, sibling) => Math.max(maximum, sibling.transform.zIndex),
      0,
    ) + 1;
    let createdId: string | undefined;
    commitComponentMutation(
      `Insert ${definition.name}`,
      (scene) => {
        const result = components.instantiate(scene, definitionId, parentId, { x, y, zIndex });
        createdId = result.instanceRootId;
        return result.scene;
      },
    );
    if (createdId) selection.select([createdId]);
  };

  const swapComponentVariant = (instanceRootId: string, variantId: string) => {
    commitComponentMutation(
      `Swap component variant`,
      (scene) => components.swapVariant(scene, instanceRootId, variantId),
      instanceRootId,
    );
  };

  const resetComponentOverrides = (instanceRootId: string) => {
    commitComponentMutation(
      "Reset component overrides",
      (scene) => components.resetOverrides(scene, instanceRootId),
      instanceRootId,
    );
  };

  const detachComponentInstance = (instanceRootId: string) => {
    commitComponentMutation(
      "Detach component instance",
      (scene) => components.detach(scene, instanceRootId),
      instanceRootId,
    );
  };

  const updateProps = (patch: Record<string, unknown>) => {
    if (!selectedNode || !canUseEditorCapability("edit-content", selectedNode)) return;
    const allowedPatch = editorModeSystem.filterContentPatch(selectedNode, patch);
    if (!Object.keys(allowedPatch).length) return;
    const nextLayout = responsive.updateLayout(selectedNode, activeBreakpoint, {
      props: allowedPatch,
    });
    const requiresStructuredReflow =
      selectedNode.extensions?.structured === true &&
      (
        Object.keys(allowedPatch).some((key) =>
          ["columns", "reverseOnMobile", "fullWidthMobile"].includes(key),
        ) ||
        (
          selectedNode.extensions?.blockType === "navigation-link" &&
          Object.prototype.hasOwnProperty.call(allowedPatch, "label")
        )
      );
    const requiresGenericReflow = layoutEngine.hasGenericLayout(liveScene);
    if (requiresStructuredReflow || requiresGenericReflow) {
      const after = cloneTree(liveScene);
      after.nodes[selectedNode.id].layout = nextLayout;
      const synchronized =
        selectedNode.extensions?.blockType === "navigation-link"
          ? navigation.synchronizeNode(after, selectedNode.id)
          : after;
      const reflowed = structuredLayout.isStructuredScene(synchronized)
        ? structuredLayout.reflowScene(synchronized)
        : layoutEngine.reflowScene(synchronized);
      commitStructuredScene(
        reflowed,
        `Update ${selectedNode.name} layout`,
        selectedNode.id,
      );
      return;
    }
    updateNodeField(selectedNode.id, "layout", selectedNode.layout, nextLayout);
  };

  const updateStyle = (patch: Partial<SceneNode["style"]>) => {
    if (!selectedNode || !canUseEditorCapability("style", selectedNode)) return;
    const nextLayout = responsive.updateLayout(selectedNode, activeBreakpoint, {
      style: patch,
    });
    updateNodeField(selectedNode.id, "layout", selectedNode.layout, nextLayout);
  };

  const updateExtensions = (patch: Record<string, unknown>) => {
    if (!selectedNode || !canUseEditorCapability("structure", selectedNode)) return;
    if (
      selectedNode.extensions?.structured === true &&
      selectedNode.extensions?.blockType === "navigation-link" &&
      Object.prototype.hasOwnProperty.call(patch, "navigationTarget")
    ) {
      const after = cloneTree(liveScene);
      after.nodes[selectedNode.id].extensions = {
        ...(after.nodes[selectedNode.id].extensions ?? {}),
        ...patch,
      };
      const synchronized = navigation.synchronizeNode(after, selectedNode.id);
      commitStructuredScene(
        structuredLayout.reflowScene(synchronized),
        `Update ${selectedNode.name} destination`,
        selectedNode.id,
      );
      return;
    }
    updateNodeField(
      selectedNode.id,
      "extensions",
      selectedNode.extensions ?? {},
      { ...(selectedNode.extensions ?? {}), ...patch },
    );
  };

  const resetResponsiveOverride = () => {
    if (
      !selectedNode ||
      activeBreakpoint === "desktop" ||
      !canUseEditorCapability("transform", selectedNode)
    ) return;
    const nextLayout = responsive.resetOverride(selectedNode, activeBreakpoint);
    updateNodeField(selectedNode.id, "layout", selectedNode.layout, nextLayout);
  };

  const resetResponsiveSetting = (setting: SettingDefinition) => {
    if (
      !selectedNode ||
      activeBreakpoint === "desktop" ||
      !canUseEditorCapability("structure", selectedNode)
    ) return;
    const target = setting.target ?? "props";
    if (target === "extensions") return;
    const nextLayout = responsive.resetValueOverride(
      selectedNode,
      activeBreakpoint,
      target,
      setting.id,
    );
    if (nextLayout === selectedNode.layout) return;
    updateNodeField(selectedNode.id, "layout", selectedNode.layout, nextLayout);
  };

  const setProductReference = (productId: string) => {
    if (!selectedNode || !canUseEditorCapability("structure", selectedNode)) return;
    const changes = createProductReferenceChanges(
      liveScene,
      selectedNode.id,
      productId,
    );
    if (!changes.length) return;
    dispatchCommand(createFieldUpdateCommand("extensions", changes));
  };

  const updateThemeChrome = (settings: ThemeChromeSettings) => {
    if (!canUseEditorCapability("theme")) return;
    const before = cloneTree(liveScene);
    const after = themeChrome.applySettings(before, settings);
    dispatchCommand(createSceneReplaceCommand(before, after, "Update theme chrome"));
  };

  const updateThemeBranding = (settings: ThemeBrandingSettings) => {
    if (!canUseEditorCapability("brand")) return;
    try {
      const transition = pages.prepareSharedRootUpdate(
        liveScene,
        (homeScene) => themeBranding.applySettings(homeScene, settings),
      );
      runPreparedPageTransaction(transition, "Update store typography", {
        operation: "brand-typography",
        pageIds: transition.after.document.pages.map((page) => page.id),
      });
      setSaveStatus("unsaved");
    } catch (error) {
      toast({
        title: "Brand update failed",
        description:
          error instanceof Error
            ? error.message
            : "Store typography could not be updated.",
        variant: "destructive",
      });
    }
  };

  const uploadThemeLogo = async (
    file: File,
    slot: ThemeLogoAssetSlot,
  ): Promise<void> => {
    if (!canUseEditorCapability("replace-logo")) return;
    const uploaded = await assetManager.uploadImage({
      file,
      altText: themeChromeSettings.logo.altText || profile?.business_name || "Store logo",
    });
    const asset = uploaded.sceneAsset;
    const before = cloneTree(liveScene);
    const withAsset = assets.upsertImage(before, asset);
    const settings = themeChrome.getSettings(withAsset);
    const key = {
      primary: "assetId",
      light: "lightAssetId",
      dark: "darkAssetId",
      fallback: "fallbackAssetId",
    }[slot] as "assetId" | "lightAssetId" | "darkAssetId" | "fallbackAssetId";
    settings.logo[key] = asset.id;
    if (slot === "primary") settings.logo.src = null;
    const after = themeChrome.applySettings(withAsset, settings);
    dispatchCommand(createSceneReplaceCommand(before, after, `Upload ${slot} logo`));
  };

  const resetThemeLogoPlacement = () => {
    if (!canUseEditorCapability("theme")) return;
    const before = cloneTree(liveScene);
    const after = themeChrome.resetLogoPlacement(
      before,
      activeBreakpoint,
    );
    dispatchCommand(
      createSceneReplaceCommand(
        before,
        after,
        `Reset ${activeBreakpoint} logo placement`,
      ),
    );
  };

  const uploadThemeMenuIcon = async (file: File): Promise<void> => {
    if (!canUseEditorCapability("theme")) return;
    if (file.type !== "image/svg+xml" && !file.name.toLowerCase().endsWith(".svg")) {
      throw new Error("Custom menu icons must be SVG files.");
    }
    const uploaded = await assetManager.uploadImage({ file, altText: "Menu" });
    const asset = uploaded.sceneAsset;
    const before = cloneTree(liveScene);
    const withAsset = assets.upsertImage(before, asset);
    const settings = themeChrome.getSettings(withAsset);
    settings.mobileMenu.customIconAssetId = asset.id;
    settings.mobileMenu.icon[activeBreakpoint].kind = "custom";
    const after = themeChrome.applySettings(withAsset, settings);
    dispatchCommand(
      createSceneReplaceCommand(before, after, "Upload custom menu icon"),
    );
  };

  const commitStructuredScene = (after: SceneTree, label: string, selectNodeId?: NodeId) => {
    const before = cloneTree(liveScene);
    const validation = sections.validateScene(after);
    const blockingIssue = validation.issues.find((issue) => issue.severity === "error");
    if (blockingIssue) {
      setSectionActionError(blockingIssue.message);
      toast({ title: "Section validation failed", description: blockingIssue.message, variant: "destructive" });
      return;
    }
    setSectionActionError(null);
    dispatchCommand(createSceneReplaceCommand(before, after, label));
    const nextRoot = after.rootNodeId ? responsive.resolveNode(after.nodes[after.rootNodeId], activeBreakpoint) : null;
    if (nextRoot) {
      canvas.setCanvasSize({
        width: responsive.getSceneWidth(after, activeBreakpoint),
        height: nextRoot.transform.height,
      });
    }
    if (selectNodeId) selection.select([selectNodeId]);
  };

  const addStructuredSection = (sectionType: string) => {
    if (!rootNodeId || !profile || !canUseEditorCapability("structure")) return;
    setSectionActionError(null);
    const definition = sections.getSection(sectionType);
    if (!definition) return;
    const before = cloneTree(liveScene);
    const selectedSection =
      selectedNode?.extensions?.editorKind === "section"
        ? selectedNode
        : selectedNode?.parentId &&
            nodes[selectedNode.parentId]?.extensions?.editorKind === "section"
          ? nodes[selectedNode.parentId]
          : null;
    let parentId = rootNodeId;
    let insertIndex = before.nodes[rootNodeId].childIds.findIndex(
      (id) => before.nodes[id]?.extensions?.sectionType === "footer",
    );
    if (insertIndex < 0) insertIndex = before.nodes[rootNodeId].childIds.length;
    if (
      (sectionInsertMode === "before" || sectionInsertMode === "after") &&
      selectedSection?.parentId
    ) {
      parentId = selectedSection.parentId;
      const siblings = before.nodes[parentId]?.childIds ?? [];
      const selectedIndex = siblings.indexOf(selectedSection.id);
      if (selectedIndex >= 0) {
        insertIndex =
          selectedIndex + (sectionInsertMode === "after" ? 1 : 0);
      }
    } else if (sectionInsertMode === "inside" && selectedNode) {
      parentId = selectedNode.id;
      insertIndex = before.nodes[parentId]?.childIds.length ?? 0;
    }
    const placement = sections.validatePlacement(before, parentId);
    if (!placement.valid) {
      const message =
        "message" in placement
          ? placement.message
          : "The section destination is invalid.";
      setSectionActionError(message);
      return;
    }
    let added: SceneNode[];
    try {
      added = createSectionPresetNodes(
        sectionType,
        parentId,
        profile,
        storeItems,
        before,
      );
    } catch (error) {
      toast({
        title: "Section could not be added",
        description: error instanceof Error ? error.message : "The section preset is invalid.",
        variant: "destructive",
      });
      setSectionActionError(
        error instanceof Error ? error.message : "The section preset is invalid.",
      );
      return;
    }
    const after = cloneTree(before);
    added.forEach((node) => {
      after.nodes[node.id] = cloneNode(node);
    });
    const parent = after.nodes[parentId];
    const addedRoot = added[0];
    parent.childIds = [
      ...parent.childIds.slice(0, insertIndex),
      addedRoot.id,
      ...parent.childIds.slice(insertIndex),
    ];
    const synchronized = navigation.ensureScene(after);
    commitStructuredScene(
      structuredLayout.reflowScene(synchronized),
      `Add ${definition.name}`,
      addedRoot.id,
    );
  };

  const addStructuredBlock = (blockType: string) => {
    if (!profile || !selectedNode || !canUseEditorCapability("structure", selectedNode)) return;
    setSectionActionError(null);
    const sectionNode =
      selectedNode.extensions?.editorKind === "section"
        ? selectedNode
        : selectedNode.parentId
          ? nodes[selectedNode.parentId]
          : null;
    if (!sectionNode || sectionNode.extensions?.editorKind !== "section") return;
    const sectionType = String(sectionNode.extensions?.sectionType ?? "");
    const definition = sections.getSection(sectionType);
    if (!definition?.blocks[blockType]) return;
    const before = cloneTree(liveScene);
    let added: SceneNode[];
    try {
      added = createBlockPresetNodes(
        sectionType,
        blockType,
        sectionNode.id,
        profile,
        storeItems,
        before,
      );
    } catch (error) {
      toast({
        title: "Block could not be added",
        description: error instanceof Error ? error.message : "The block preset is invalid.",
        variant: "destructive",
      });
      setSectionActionError(
        error instanceof Error ? error.message : "The block preset is invalid.",
      );
      return;
    }
    const after = cloneTree(before);
    added.forEach((node) => {
      after.nodes[node.id] = cloneNode(node);
    });
    if (blockType === "navigation-link") {
      const customPage = pageSnapshot?.document.pages.find((page) => page.kind === "custom");
      const navigationKey = `custom-${Date.now().toString(36)}`;
      after.nodes[added[0].id].name = "Custom navigation link";
      after.nodes[added[0].id].props = {
        ...after.nodes[added[0].id].props,
        label: customPage?.title ?? "Custom link",
      };
      after.nodes[added[0].id].extensions = {
        ...(after.nodes[added[0].id].extensions ?? {}),
        navigationKey,
        navigationTarget: customPage
          ? { type: "page", entityId: customPage.id }
          : { type: "route", routeKey: "home" },
      };
    }
    after.nodes[sectionNode.id].childIds = [...after.nodes[sectionNode.id].childIds, added[0].id];
    const synchronized =
      blockType === "navigation-link"
        ? navigation.synchronizeNode(after, added[0].id)
        : after;
    commitStructuredScene(
      structuredLayout.reflowScene(synchronized),
      `Add ${definition.blocks[blockType]?.name ?? blockType}`,
      added[0].id,
    );
  };

  const updateDesignToken = (
    token: ThemeColorToken,
    color: string,
  ) => {
    if (!structuredScene || !rootNodeId || !canUseEditorCapability("theme")) return;
    const previousColor = designTokenColors[token];
    if (previousColor.toLowerCase() === color.toLowerCase()) return;
    const after = cloneTree(liveScene);
    const replaceProps = (props: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(props).map(([key, value]) => [
          key,
          typeof value === "string" && value.toLowerCase() === previousColor.toLowerCase() ? color : value,
        ]),
      );
    Object.values(after.nodes).forEach((node) => {
      node.props = replaceProps(node.props);
      node.style = {
        ...node.style,
        fills: node.style.fills.map((fill) =>
          fill.type === "solid" && fill.color.toLowerCase() === previousColor.toLowerCase()
            ? { ...fill, color }
            : fill,
        ),
      };
      const responsiveMap =
        node.layout.responsive && typeof node.layout.responsive === "object"
          ? node.layout.responsive as Record<string, Record<string, unknown>>
          : null;
      if (responsiveMap) {
        node.layout = {
          ...node.layout,
          responsive: Object.fromEntries(
            Object.entries(responsiveMap).map(([breakpoint, override]) => {
              const overrideStyle =
                override.style && typeof override.style === "object"
                  ? override.style as SceneNode["style"]
                  : null;
              return [
                breakpoint,
                {
                  ...override,
                  ...(override.props && typeof override.props === "object"
                    ? { props: replaceProps(override.props as Record<string, unknown>) }
                    : {}),
                  ...(overrideStyle
                    ? {
                        style: {
                          ...overrideStyle,
                          fills: overrideStyle.fills.map((fill) =>
                            fill.type === "solid" && fill.color.toLowerCase() === previousColor.toLowerCase()
                              ? { ...fill, color }
                              : fill,
                          ),
                        },
                      }
                    : {}),
                },
              ];
            }),
          ),
        };
      }
    });
    const root = after.nodes[rootNodeId];
    const currentTokens = root.extensions?.designTokens as {
      colors?: Record<string, unknown>;
      [key: string]: unknown;
    } | undefined;
    root.extensions = {
      ...(root.extensions ?? {}),
      designTokens: {
        ...(currentTokens ?? {}),
        colors: { ...(currentTokens?.colors ?? {}), [token]: color },
      },
    };
    commitStructuredScene(after, `Update ${token} theme color`);
    if (token === "primary") setProfile((current) => current ? { ...current, store_color: color } : current);
  };

  const reorderStructuredNode = (direction: "up" | "down", targetNode: SceneNode | null = selectedNode) => {
    if (!targetNode?.parentId || !canUseEditorCapability("structure", targetNode)) return;
    const parent = nodes[targetNode.parentId];
    if (!parent) return;
    const kind = targetNode.extensions?.editorKind;
    const siblings = parent.childIds.filter((id) => nodes[id]?.extensions?.editorKind === kind);
    const siblingIndex = siblings.indexOf(targetNode.id);
    const targetSibling = siblings[siblingIndex + (direction === "up" ? -1 : 1)];
    if (!targetSibling) return;
    const targetIndex = parent.childIds.indexOf(targetSibling);
    const next = structuredLayout.reorderNode(liveScene, targetNode.id, targetIndex);
    commitStructuredScene(next, `${direction === "up" ? "Move up" : "Move down"} ${targetNode.name}`, targetNode.id);
  };

  const reorderStructuredTo = (activeNodeId: NodeId, overNodeId: NodeId) => {
    const activeNode = nodes[activeNodeId];
    const overNode = nodes[overNodeId];
    if (!activeNode || !canUseEditorCapability("structure", activeNode)) return;
    if (
      !activeNode?.parentId ||
      activeNode.parentId !== overNode?.parentId ||
      activeNode.extensions?.editorKind !== overNode.extensions?.editorKind
    ) {
      toast({ title: "Invalid reorder", description: "Sections and blocks can only move within their current parent." });
      return;
    }
    const parent = nodes[activeNode.parentId];
    const targetIndex = parent.childIds.indexOf(overNodeId);
    const next = structuredLayout.reorderNode(liveScene, activeNodeId, targetIndex);
    commitStructuredScene(next, `Reorder ${activeNode.name}`, activeNode.id);
  };

  const insertNode = (
    type: SceneNode["type"],
    options: {
      shapePreset?: ShapePreset;
      textPreset?: TextPreset;
      imageAsset?: ImageAssetRecord;
      imageSrcSet?: string;
      imageName?: string;
    } = {},
  ) => {
    if (!canUseEditorCapability("structure")) return;
    const selectedCanContainChildren =
      selectedNode?.type === "container" ||
      selectedNode?.type === "section" ||
      selectedNode?.extensions?.acceptsChildren === true;
    const selectedParent = selectedNode?.parentId
      ? nodes[selectedNode.parentId]
      : null;
    const parentId = selectedCanContainChildren
      ? selectedNode.id
      : selectedParent?.type === "container" || selectedParent?.type === "section"
        ? selectedParent.id
        : rootNodeId;
    if (!parentId) return;
    const textPreset = options.textPreset ?? "heading";
    const textPresetData = {
      heading: { name: "Heading", text: "Add a heading", fontSize: 32, fontWeight: 800, width: 320, height: 58 },
      subheading: { name: "Subheading", text: "Add a subheading", fontSize: 22, fontWeight: 650, width: 300, height: 44 },
      paragraph: { name: "Paragraph", text: "Add paragraph text", fontSize: 16, fontWeight: 400, width: 360, height: 96 },
    }[textPreset];
    const shapePreset = options.shapePreset ?? "rectangle";
    const shapeSize =
      shapePreset === "circle"
        ? { width: 180, height: 180 }
        : shapePreset === "ellipse"
          ? { width: 240, height: 150 }
          : shapePreset === "line" || shapePreset === "arrow"
            ? { width: 260, height: 48 }
            : { width: 180, height: 160 };
    const standardBase = {
      text: {
        name: textPresetData.name,
        transform: { x: 96, y: 96, width: textPresetData.width, height: textPresetData.height },
        props: {
          text: textPresetData.text,
          color: "#111827",
          fontSize: textPresetData.fontSize,
          fontWeight: textPresetData.fontWeight,
          fontBinding: "brand",
          typographyRole: textPreset === "paragraph" ? "body" : "heading",
        },
      },
      button: { name: "Button", transform: { x: 96, y: 180, width: 168, height: 54 }, props: { label: "Button", background: "#0178ff", color: "#FFFFFF", fontSize: 16, fontWeight: 800, fontBinding: "brand", typographyRole: "ui" } },
      shape: {
        name: shapePreset.charAt(0).toUpperCase() + shapePreset.slice(1),
        transform: { x: 96, y: 260, ...shapeSize },
        props: { shapeKind: shapePreset },
      },
      image: {
        name: options.imageName || "Image",
        transform: { x: 96, y: 420, width: 320, height: 220 },
        props: {
          ...(options.imageAsset ? { assetId: options.imageAsset.id } : {}),
          ...(options.imageSrcSet ? {
            srcSet: options.imageSrcSet,
            sizes: "(max-width: 640px) 100vw, 50vw",
          } : {}),
          alt: options.imageName || "Store image",
          objectFit: "cover",
        },
      },
    }[type as "text" | "button" | "shape" | "image"];
    const base = type === CUSTOM_CODE_NODE_TYPE
      ? {
          name: "Custom React section",
          transform: { x: 96, y: 96, width: 720, height: 360 },
          props: createDefaultCustomCodeProps(),
        }
      : standardBase;
    if (!base) return;
    const created = createSceneNode(
      {
        id: `${type.replace(/[^a-z0-9-]/gi, "-")}-${Date.now().toString(36)}`,
        type,
        name: base.name,
        props: base.props,
        transform: { ...base.transform, zIndex: Object.keys(nodes).length + 1 },
        style: {
          fills: type === "shape" || type === "image" || type === CUSTOM_CODE_NODE_TYPE
            ? [{ type: "solid", color: type === "image" ? "#e5e7eb" : type === CUSTOM_CODE_NODE_TYPE ? "#ffffff" : "#0178ff" }]
            : [],
          strokes: type === "shape" ? [{ color: "#0A6FDB", width: 1, style: "solid" }] : [],
          effects: [],
          opacity: 1,
          cornerRadius: type === "shape" || type === "image" || type === "button" || type === CUSTOM_CODE_NODE_TYPE ? 8 : undefined,
        },
      },
      parentId,
    );
    const responsiveNode = responsive.ensureSceneOverrides({
      rootNodeId,
      nodes: { ...nodes, [created.id]: created },
    }).nodes[created.id];
    if (structuredScene && nodes[parentId]?.extensions?.editorKind === "section") {
      const before = cloneTree(liveScene);
      const after = options.imageAsset
        ? assets.upsertImage(before, options.imageAsset)
        : cloneTree(before);
      after.nodes[responsiveNode.id] = cloneNode(responsiveNode);
      after.nodes[parentId].childIds = [
        ...after.nodes[parentId].childIds,
        responsiveNode.id,
      ];
      commitStructuredScene(
        structuredLayout.reflowScene(after),
        `Add ${responsiveNode.name}`,
        responsiveNode.id,
      );
    } else if (options.imageAsset) {
      const before = cloneTree(liveScene);
      const after = assets.upsertImage(before, options.imageAsset);
      after.nodes[responsiveNode.id] = cloneNode(responsiveNode);
      after.nodes[parentId].childIds = [...after.nodes[parentId].childIds, responsiveNode.id];
      dispatchCommand(createSceneReplaceCommand(before, after, `Add ${responsiveNode.name}`));
    } else {
      dispatchCommand(createInsertCommand([responsiveNode], parentId));
    }
    tools.activate("select");
    selection.select([responsiveNode.id]);
  };

  const uploadImageNode = (file: File) => {
    if (!canUseEditorCapability("structure")) return;
    void assetManager.uploadImage({ file, altText: file.name.replace(/\.[^.]+$/, "") })
      .then((uploaded) => insertNode("image", {
        imageAsset: uploaded.sceneAsset,
        imageSrcSet: uploaded.srcSet,
        imageName: file.name,
      }))
      .catch((error: unknown) => {
        toast({
          title: "Image upload failed",
          description: error instanceof Error ? error.message : "The selected image could not be uploaded.",
          variant: "destructive",
        });
      });
  };

  const replaceSelectedImage = async (file: File): Promise<void> => {
    if (
      !selectedNode ||
      selectedNode.type !== "image" ||
      !canUseEditorCapability("replace-image", selectedNode)
    ) return;
    const uploaded = await assetManager.uploadImage({
      file,
      altText: String(selectedNode.props.alt ?? file.name),
    });
    const before = cloneTree(liveScene);
    const after = assets.upsertImage(before, uploaded.sceneAsset);
    const target = after.nodes[selectedNode.id];
    if (!target) throw new Error("The selected image no longer exists.");
    const { src: _legacySource, ...retainedProps } = target.props;
    target.props = {
      ...retainedProps,
      assetId: uploaded.asset.id,
      srcSet: uploaded.srcSet || undefined,
      sizes: retainedProps.sizes ?? "(max-width: 640px) 100vw, 50vw",
      alt: retainedProps.alt ?? uploaded.sceneAsset.altText,
    };
    target.meta = { ...target.meta, updatedAt: Date.now() };
    dispatchCommand(createSceneReplaceCommand(before, after, `Replace ${selectedNode.name}`));
  };

  const deleteStructuredNode = (node: SceneNode) => {
      if (!canUseEditorCapability("structure", node)) return;
      const editorKind = node.extensions?.editorKind;
      if (editorKind === "block" && node.extensions?.blockType === "navigation-link") {
        const target = node.extensions?.navigationTarget;
        const itemId =
          typeof node.extensions?.navigationKey === "string"
            ? node.extensions.navigationKey
            : typeof target === "string"
              ? target.replace(/^\/+/, "")
              : node.id;
        const after = navigation.removeItem(
          cloneTree(liveScene),
          itemId,
        );
        commitStructuredScene(
          structuredLayout.reflowScene(after),
          `Delete ${node.name}`,
        );
        selection.clearSelection();
        return;
      }
      const after = cloneTree(liveScene);
      const remove = (nodeId: NodeId) => {
        after.nodes[nodeId]?.childIds.forEach(remove);
        delete after.nodes[nodeId];
      };
      if (node.parentId) {
        after.nodes[node.parentId].childIds = after.nodes[node.parentId].childIds
          .filter((id) => id !== node.id);
      }
      remove(node.id);
      commitStructuredScene(structuredLayout.reflowScene(after), `Delete ${node.name}`);
      selection.clearSelection();
  };

  const deleteSelected = () => {
    if (!selectedIds.length || !canUseEditorCapability("structure")) return;
    if (selectedNode?.extensions?.structured === true) {
      deleteStructuredNode(selectedNode);
      return;
    }
    dispatchCommand(createDeleteCommand(selectedIds));
    selection.clearSelection();
  };

  const copySelected = () => {
    const copied = selectedIds.map((id) => nodes[id]).filter((node): node is SceneNode => Boolean(node)).map(cloneNode);
    setClipboard(copied.length ? copied : null);
  };

  const pasteClipboard = () => {
    if (!clipboard?.length || !rootNodeId || !canUseEditorCapability("structure")) return;
    if (structuredScene && clipboard[0].extensions?.structured === true) {
      const source = nodes[clipboard[0].id];
      if (source) duplicateStructuredNode(source);
      return;
    }
    const clones = clipboard.flatMap((node) => duplicateSubtree(node, nodes, rootNodeId));
    dispatchCommand(createInsertCommand(clones, rootNodeId));
    selection.select(clones.filter((node) => node.parentId === rootNodeId).map((node) => node.id));
  };

  const duplicateStructuredNode = (source: SceneNode) => {
      if (!rootNodeId || !source.parentId || !canUseEditorCapability("structure", source)) return;
      const clones = duplicateSubtree(source, nodes, source.parentId, 0);
      const after = cloneTree(liveScene);
      clones.forEach((node) => {
        after.nodes[node.id] = cloneNode(node);
      });
      const parent = after.nodes[source.parentId];
      const sourceIndex = parent.childIds.indexOf(source.id);
      parent.childIds = [
        ...parent.childIds.slice(0, sourceIndex + 1),
        clones[0].id,
        ...parent.childIds.slice(sourceIndex + 1),
      ];
      commitStructuredScene(structuredLayout.reflowScene(after), `Duplicate ${source.name}`, clones[0].id);
  };

  const duplicateSelected = () => {
    if (!canUseEditorCapability("structure")) return;
    const copied = selectedIds.map((id) => nodes[id]).filter((node): node is SceneNode => Boolean(node));
    if (!copied.length || !rootNodeId) return;
    if (copied.length === 1 && copied[0].extensions?.structured === true && copied[0].parentId) {
      duplicateStructuredNode(copied[0]);
      return;
    }
    const clones = copied.flatMap((node) => duplicateSubtree(node, nodes, node.parentId ?? rootNodeId));
    dispatchCommand(createInsertCommand(clones, copied[0].parentId ?? rootNodeId));
    selection.select(clones.filter((node) => copied.some((source) => source.parentId === node.parentId)).map((node) => node.id));
  };

  const toggleLock = () => {
    if (!selectedNode || !canUseEditorCapability("structure", selectedNode)) return;
    updateNodeField(selectedNode.id, "meta.locked", selectedNode.meta.locked, !selectedNode.meta.locked);
  };

  const setStructuredNodeHidden = (node: SceneNode, hidden: boolean) => {
      if (!canUseEditorCapability("structure", node)) return;
      const after = cloneTree(liveScene);
      const source = after.nodes[node.id];
      source.layout = responsive.updateLayout(source, activeBreakpoint, {
        meta: { hidden, locked: responsive.resolveNode(source, activeBreakpoint).meta.locked },
      });
      commitStructuredScene(structuredLayout.reflowScene(after), `${hidden ? "Hide" : "Show"} ${node.name}`, node.id);
  };

  const setHidden = (hidden: boolean) => {
    if (!selectedNode || !canUseEditorCapability("structure", selectedNode)) return;
    if (selectedNode.extensions?.structured === true) {
      setStructuredNodeHidden(selectedNode, hidden);
      return;
    }
    const nextLayout = responsive.updateLayout(selectedNode, activeBreakpoint, {
      meta: { hidden, locked: responsive.resolveNode(selectedNode, activeBreakpoint).meta.locked },
    });
    updateNodeField(selectedNode.id, "layout", selectedNode.layout, nextLayout);
  };

  const moveZ = (direction: "front" | "back") => {
    if (!selectedNode || !canUseEditorCapability("structure", selectedNode)) return;
    const zValues = Object.values(nodes).map((node) => responsive.resolveNode(node, activeBreakpoint).transform.zIndex);
    const nextZ = direction === "front" ? Math.max(...zValues) + 1 : Math.min(...zValues) - 1;
    updateTransform({ zIndex: nextZ });
  };

  const changeBreakpoint = (breakpoint: ResponsiveBreakpoint) => {
    responsive.activate(breakpoint);
    const sourceRoot = rootNodeId ? nodes[rootNodeId] : null;
    const resolvedRoot = sourceRoot ? responsive.resolveNode(sourceRoot, breakpoint) : null;
    canvas.setCanvasSize({
      width: responsive.getSceneWidth(liveScene, breakpoint),
      height: Math.max(1, resolvedRoot?.transform.height ?? editorStores.canvas.getState().size.height),
    });
    selection.clearSelection();
    scheduleFitToWidth(viewport, rootNodeId);
  };

  const changeEditorMode = (mode: EditorMode) => {
    transformSystem.cancelTransform();
    editorModeSystem.setMode(mode);
    tools.activate("select");
    if (mode === "fixed") {
      setAddingPage(false);
      if (leftPanel === "tools" || leftPanel === "variables") {
        setLeftPanel("layers");
      }
    }
  };

  const shareSelectedAcrossBreakpoints = () => {
    if (!selectedNode || !canUseEditorCapability("transform", selectedNode)) return;
    const nextLayout = responsive.shareCurrentLayout(selectedNode, activeBreakpoint);
    updateNodeField(selectedNode.id, "layout", selectedNode.layout, nextLayout);
  };

  const selectStructuredNode = (node: SceneNode) => {
    tools.activate("select");
    selection.select([node.id], { includeHidden: true, includeLocked: true });
    window.requestAnimationFrame(() => {
      const shell = document.querySelector<HTMLElement>("[data-editor-canvas-shell]");
      const selectorId =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(node.id)
          : node.id.replace(/["\\]/g, "\\$&");
      const element = shell?.querySelector<HTMLElement>(`[data-node-id="${selectorId}"]`);
      if (!shell || !element) return;
      const shellRect = shell.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      viewport.panBy({
        x: shellRect.left + shellRect.width / 2 - (elementRect.left + elementRect.width / 2),
        y: shellRect.top + shellRect.height / 2 - (elementRect.top + elementRect.height / 2),
      });
    });
  };

  const renameStructuredNode = (node: SceneNode, name: string) => {
    if (!canUseEditorCapability("structure", node)) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === node.name) return;
    updateNodeField(node.id, "name", node.name, trimmed);
  };

  const fitPage = () => {
    viewport.fitToWidth(rootNodeId ? [rootNodeId] : undefined);
  };

  const preparePageScene = async (sceneTree: SceneTree): Promise<SceneTree> => {
    if (!profile) throw new Error("The store profile is not loaded.");
    let scene = await reconcileEngineTemplateScene(
      sceneTree,
      profile,
      storeItems,
    );
    scene = responsive.ensureSceneOverrides(scene);
    if (structuredLayout.isStructuredScene(scene)) scene = structuredLayout.reflowScene(scene);
    nodeSchemas.assertTree(scene);
    return scene;
  };

  const loadPageIntoEditor = async (sceneTree: SceneTree) => {
    const scene = await preparePageScene(sceneTree);
    commandGraph.deserializeTree(scene);
    historyManager.clear();
    selection.clearSelection();
    syncCanvasToScene(scene);
    setLeftPanel("layers");
    setSaveStatus("unsaved");
  };

  const loadDocumentIntoEditor = async (
    document: unknown,
    status: EditorSaveStatus = "unsaved",
  ) => {
    if (!migrations.isEngineDocument(document)) {
      throw new Error("Recovery document is missing engine_scene.");
    }
    const migrated = migrations.migrate(document);
    const homeScene = getRequiredEngineScene(migrated.document, "Recovery document");
    const loadedPages = pages.load(migrated.document, homeScene);
    setPageSnapshot(loadedPages);
    const targetScene =
      loadedPages.document.pages.find((page) => page.id === loadedPages.activePageId)?.scene ??
      homeScene;
    await loadPageIntoEditor(targetScene);
    setProfile((current) => current ? { ...current, theme: migrated.document } : current);
    setSaveStatus(status);
    return migrated.document;
  };

  const prepareStablePageTransition = async (
    prepare: (currentScene: SceneTree) => PreparedPageTransition,
  ): Promise<PreparedPageTransition> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const sceneState = editorStores.scene.getState();
      const pageRevision = pages.getSnapshot().revision;
      const transition = prepare(commandGraph.serializeTree());
      const scene = await preparePageScene(transition.scene);
      if (
        editorStores.scene.getState().revision === sceneState.revision &&
        pages.getSnapshot().revision === pageRevision
      ) {
        return pages.finalizeTransition(transition, scene);
      }
    }
    throw new Error(
      "The document changed while the page was being prepared. Try again after the current edit finishes.",
    );
  };

  const commitPageTransition = (
    transition: PreparedPageTransition,
    label: string,
  ) => {
    runPreparedPageTransaction(transition, label, {
      fromPageId: transition.before.activePageId,
      toPageId: transition.after.activePageId,
    });
    selection.clearSelection();
    setLeftPanel("layers");
    setSaveStatus("unsaved");
  };

  const switchPage = async (pageId: string) => {
    if (
      !rootNodeId ||
      pageId === pageSnapshot?.activePageId ||
      pageTransitionActiveRef.current
    ) {
      return;
    }
    pageTransitionActiveRef.current = true;
    try {
      const transition = await prepareStablePageTransition((currentScene) =>
        pages.prepareActivate(pageId, currentScene),
      );
      commitPageTransition(transition, `Open ${transition.page.title}`);
    } catch (error) {
      toast({
        title: "Page could not be opened",
        description: error instanceof Error ? error.message : "The page document is invalid.",
        variant: "destructive",
      });
    } finally {
      pageTransitionActiveRef.current = false;
    }
  };

  const createCustomPage = async () => {
    if (
      !profile ||
      !rootNodeId ||
      pageTransitionActiveRef.current ||
      !canUseEditorCapability("structure")
    ) return;
    const title = newPageTitle.trim() || "Untitled page";
    const slug = pageSlug(title);
    pageTransitionActiveRef.current = true;
    try {
      const transition = await prepareStablePageTransition((currentScene) =>
        pages.prepareAddPage(
          {
            title,
            slug,
            scene: buildBasicCustomPageScene(profile, title, slug),
          },
          currentScene,
        ),
      );
      commitPageTransition(transition, `Create ${transition.page.title}`);
      setNewPageTitle("");
      setAddingPage(false);
      toast({
        title: "Page created",
        description: `${transition.page.title} is ready with the global store navigation.`,
      });
    } catch (error) {
      toast({
        title: "Page could not be created",
        description: error instanceof Error ? error.message : "The page document is invalid.",
        variant: "destructive",
      });
    } finally {
      pageTransitionActiveRef.current = false;
    }
  };

  const selectAllEditable = () => {
    const editableIds = layers
      .filter((node) => node.id !== rootNodeId && !node.meta.hidden && !node.meta.locked)
      .map((node) => node.id);
    tools.activate("select");
    selection.select(editableIds);
  };

  const captureRevisionConflict = useCallback(async (
    localDocument: Record<string, unknown>,
    localBaseRevision: number,
    reportedServerRevision: number | null = null,
  ) => {
    if (!user) throw new Error("Authentication is required to resolve a revision conflict.");
    if (!activeStoreId) return;
    const latest = await editorData.load(user, activeStoreId);
    const latestRaw = latest.profile.theme_draft ?? latest.profile.theme;
    if (!migrations.isEngineDocument(latestRaw)) {
      throw new Error("The server conflict copy is not an Engine Scene document.");
    }
    const latestDocument = migrations.migrate(latestRaw).document;
    const serverRevision = Number(
      latest.profile.theme_revision ?? reportedServerRevision ?? 0,
    );
    const conflict = await recovery.captureConflict({
      storeId: activeStoreId,
      localBaseRevision,
      serverRevision,
      localDocument,
      serverDocument: latestDocument,
    });
    setRevisionConflict(conflict);
    publishingService.initialize(
      serverRevision,
      latest.profile.theme_published
        ? { storeId: activeStoreId, document: latest.profile.theme_published }
        : null,
    );
    await refreshPublicationRecovery();
    return conflict;
  }, [
    activeStoreId,
    editorData,
    migrations,
    publishingService,
    recovery,
    refreshPublicationRecovery,
    user,
  ]);

  const persistScene = useCallback(async (mode: "draft" | "publish", announce = false): Promise<boolean> => {
    if (!user || !profile || !activeStoreId) return false;
    const revision = editorStores.scene.getState().revision;
    const prepared = buildVersionedDocument();
    const theme = prepared.document;
    if (prepared.report.steps.length) {
      try {
        await recovery.captureMigration(activeStoreId, prepared);
      } catch {
        // Recovery storage failure is separately reported and cannot block a valid server save.
      }
    }

    if (mode === "publish") setPublishing(true);
    else setSaving(true);
    setSaveStatus("saving");

    let writeResult: StorefrontWriteResult | null = null;
    let writeError: unknown = null;
    const expectedRevision = publishingService.getRevision();
    try {
      const write = {
        storeId: activeStoreId,
        userId: user.id,
        document: theme,
        storeColor: profile.store_color ?? null,
        context: {
          productIds: storeItems
            .map((item) => item.id)
            .filter((id): id is string | number => id !== null && id !== undefined),
        },
      };
      if (mode === "publish") {
        writeResult = await publishingService.publish(write);
      } else {
        writeResult = await publishingService.saveDraft(write);
      }
    } catch (error) {
      writeError = error;
      if (error instanceof StorefrontRevisionConflictError) {
        try {
          await captureRevisionConflict(theme, expectedRevision, error.serverRevision);
        } catch (conflictError) {
          writeError = conflictError;
        }
      } else if (!(error instanceof ThemePolicyViolationError)) {
        try {
          await recovery.queueSave(mode, theme, expectedRevision, error);
        } catch {
          // The valid in-memory document remains available even if IndexedDB is unavailable.
        }
      }
    }

    setSaving(false);
    setPublishing(false);
    if (!writeResult) {
      const publicationBlocked = writeError instanceof ThemePolicyViolationError;
      setSaveStatus(
        publicationBlocked
          ? revision === lastPersistedRevisionRef.current
            ? "publish-blocked"
            : "unsaved"
          : "failed",
      );
      const message = writeError instanceof Error
        ? writeError.message
        : "Storefront persistence failed.";
      if (announce || mode === "publish") {
        toast({
          title: publicationBlocked
            ? "Publish needs fixes"
            : writeError instanceof StorefrontRevisionConflictError
              ? "Save conflict needs review"
              : mode === "publish" ? "Publish failed" : "Save failed",
          description: message,
          variant: "destructive",
        });
      }
      return false;
    }

    if (mode === "publish" && storeSlug) storefrontData.invalidateStore(storeSlug);
    if (mode === "publish") {
      try {
        await refreshAuthorization();
      } catch {
        // The publication is durable even if the dashboard status refresh is delayed.
      }
    }
    const currentRevision = editorStores.scene.getState().revision;
    let recoveryConfirmedCurrent = currentRevision === revision;
    try {
      if (currentRevision === revision) {
        recoveryConfirmedCurrent = await recovery.markSaved(writeResult.revision, theme);
      } else {
        await recovery.acknowledgeServerRevision(writeResult.revision);
      }
    } catch {
      // Server persistence succeeded; recovery storage failure is reported independently.
    }
    lastPersistedRevisionRef.current = revision;
    if (mode === "publish") await refreshPublicationRecovery();
    const latestRevision = editorStores.scene.getState().revision;
    setSaveStatus(
      recoveryConfirmedCurrent && latestRevision === revision
        ? mode === "publish" ? "published" : "saved"
        : "unsaved",
    );
    setProfile((current) => current ? { ...current, theme } : current);
    if (announce) {
      toast({
        title: mode === "publish" ? "Storefront published" : "Draft saved",
        description: mode === "publish"
          ? "The published snapshot is now live."
          : "Scene Graph draft persisted.",
      });
    }
    return true;
  }, [
    activeStoreId,
    buildVersionedDocument,
    captureRevisionConflict,
    editorStores.scene,
    profile,
    publishingService,
    recovery,
    refreshPublicationRecovery,
    refreshAuthorization,
    storeItems,
    storefrontData,
    storeSlug,
    toast,
    user,
  ]);

  const save = () => {
    void persistScene("draft", true);
  };

  const publish = () => {
    void persistScene("publish", true);
  };

  const restorePublication = async (recoveryPointId: string) => {
    if (!user || !profile || restoringRecoveryPointId) return;
    const point = recoveryPoints.find((candidate) => candidate.id === recoveryPointId);
    if (!point) return;
    if (!window.confirm(`Restore revision ${point.revision} and publish it as a new revision?`)) return;
    setRestoringRecoveryPointId(recoveryPointId);
    try {
      const recoveryInput = {
        storeId: activeStoreId,
        userId: user.id,
        storeColor: profile.store_color ?? null,
        context: {
          productIds: storeItems
            .map((item) => item.id)
            .filter((id): id is string | number => id !== null && id !== undefined),
        },
      };
      let restoredDocument: unknown;
      let writeResult: StorefrontWriteResult;
      if (point.source === "server") {
        const publication = await publishingService.getPersistedPublication(point.sourceId);
        if (!publication?.document) {
          throw new Error("Durable publication snapshot was not found.");
        }
        if (!migrations.isEngineDocument(publication.document)) {
          throw new Error("Durable publication is not an Engine Scene document.");
        }
        restoredDocument = migrations.migrate(publication.document).document;
        writeResult = await publishingService.publish({
          ...recoveryInput,
          document: restoredDocument,
        });
      } else {
        const sessionPoint = publishingService
          .listRecoveryPoints()
          .find((candidate) => candidate.id === point.sourceId);
        if (!sessionPoint) throw new Error("Session recovery point was not found.");
        restoredDocument = sessionPoint.document;
        writeResult = await publishingService.rollback(point.sourceId, recoveryInput);
      }
      const migratedDocument = await loadDocumentIntoEditor(restoredDocument, "published");
      lastPersistedRevisionRef.current = editorStores.scene.getState().revision;
      try {
        await recovery.markSaved(writeResult.revision, migratedDocument);
      } catch {
        // The durable server publication succeeded even if local recovery storage is unavailable.
      }
      await refreshPublicationRecovery();
      if (storeSlug) storefrontData.invalidateStore(storeSlug);
      toast({
        title: "Publication restored",
        description: `Revision ${point.revision} was validated and published as a new revision.`,
      });
    } catch (error) {
      toast({
        title: "Publication restore failed",
        description: error instanceof Error ? error.message : "The recovery point could not be restored.",
        variant: "destructive",
      });
    } finally {
      setRestoringRecoveryPointId(null);
    }
  };

  const restoreStartupDraft = async () => {
    if (!startupRecovery) return;
    try {
      let document: unknown;
      if (startupRecovery.hasServerConflict && revisionConflict) {
        document = await recovery.resolveConflict(revisionConflict.id, "keep-local");
      } else {
        document = await recovery.restoreCandidate(startupRecovery);
      }
      await loadDocumentIntoEditor(document, "unsaved");
      lastPersistedRevisionRef.current = -1;
      setStartupRecovery(null);
      setRevisionConflict(null);
      setShowRecoveryDifferences(false);
      toast({
        title: "Unsaved work restored",
        description: "The recovered copy is open as an unsaved draft.",
      });
    } catch (error) {
      toast({
        title: "Recovery failed",
        description: error instanceof Error ? error.message : "The local draft could not be restored.",
        variant: "destructive",
      });
    }
  };

  const discardStartupDraft = async () => {
    if (!startupRecovery) return;
    try {
      if (startupRecovery.hasServerConflict && revisionConflict) {
        await recovery.resolveConflict(revisionConflict.id, "use-server");
      } else {
        await recovery.discardCandidate(startupRecovery);
      }
      setStartupRecovery(null);
      setRevisionConflict(null);
      setShowRecoveryDifferences(false);
      setSaveStatus("saved");
    } catch (error) {
      toast({
        title: "Recovery cleanup failed",
        description: error instanceof Error ? error.message : "The recovered draft could not be discarded.",
        variant: "destructive",
      });
    }
  };

  const resolveVisibleConflict = async (resolution: "keep-local" | "use-server") => {
    if (!revisionConflict) return;
    try {
      const document = await recovery.resolveConflict(revisionConflict.id, resolution);
      await loadDocumentIntoEditor(
        document,
        resolution === "keep-local" ? "unsaved" : "saved",
      );
      lastPersistedRevisionRef.current = resolution === "keep-local"
        ? -1
        : editorStores.scene.getState().revision;
      setRevisionConflict(null);
      setStartupRecovery(null);
      toast({
        title: resolution === "keep-local" ? "Local copy preserved" : "Server copy loaded",
        description: resolution === "keep-local"
          ? "Review the recovered draft, then save when ready."
          : "The latest server revision is now open.",
      });
    } catch (error) {
      toast({
        title: "Conflict resolution failed",
        description: error instanceof Error ? error.message : "The selected copy could not be loaded.",
        variant: "destructive",
      });
    }
  };

  const retryQueuedSaves = useCallback(async () => {
    if (!user || !profile || startupRecovery || revisionConflict) return;
    const outcomes = await recovery.retryPending(
      async (retry) => {
        const activeRevision = publishingService.getRevision();
        if (retry.baseServerRevision !== activeRevision) {
          throw new StorefrontRevisionConflictError(
            retry.baseServerRevision,
            activeRevision,
            `Queued save is based on revision ${retry.baseServerRevision}; server is ${activeRevision}.`,
          );
        }
        const write = {
          storeId: activeStoreId,
          userId: user.id,
          document: retry.document,
          storeColor: profile.store_color ?? null,
          context: {
            productIds: storeItems
              .map((item) => item.id)
              .filter((id): id is string | number => id !== null && id !== undefined),
          },
        };
        const result = retry.mode === "publish"
          ? await publishingService.publish(write)
          : await publishingService.saveDraft(write);
        if (retry.mode === "publish" && storeSlug) storefrontData.invalidateStore(storeSlug);
        return result;
      },
      async (error, retry) => {
        if (error instanceof ThemePolicyViolationError) return "discard";
        if (!(error instanceof StorefrontRevisionConflictError)) return "retry";
        if (!migrations.isEngineDocument(retry.document)) return "retry";
        await captureRevisionConflict(
          retry.document,
          retry.baseServerRevision,
          error.serverRevision,
        );
        return "discard";
      },
    );
    const currentSaved = outcomes.some(
      (outcome) => outcome.status === "saved" && outcome.currentDocumentSaved,
    );
    if (currentSaved) {
      lastPersistedRevisionRef.current = editorStores.scene.getState().revision;
      setSaveStatus("saved");
    }
    if (outcomes.some((outcome) => outcome.status === "saved")) {
      await refreshPublicationRecovery();
    }
  }, [
    activeStoreId,
    captureRevisionConflict,
    editorStores.scene,
    migrations,
    profile,
    publishingService,
    recovery,
    refreshPublicationRecovery,
    revisionConflict,
    storefrontData,
    storeItems,
    storeSlug,
    startupRecovery,
    user,
  ]);

  useEffect(() => {
    if (loading || startupRecovery || revisionConflict) return;
    void retryQueuedSaves();
    const onOnline = () => {
      void retryQueuedSaves();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [loading, retryQueuedSaves, revisionConflict, startupRecovery]);

  useEffect(() => {
    if (loading || startupRecovery || revisionConflict || !user || !profile || !rootNodeId) return;
    if (sceneRevision === lastPersistedRevisionRef.current) return;
    setSaveStatus("unsaved");
    const timer = window.setTimeout(() => {
      void persistScene("draft");
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [loading, persistScene, profile, revisionConflict, rootNodeId, sceneRevision, startupRecovery, user]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (saveStatus !== "unsaved" && saveStatus !== "failed") return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [saveStatus]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const isTyping = isTypingTarget(event.target);
      const editingId = editorStores.selection.getState().editingId;
      const canvasFocused = isCanvasFocusActive();
      if (isTyping || editingId || !canvasFocused) return;
      const commandKey = event.ctrlKey || event.metaKey;
      if (commandKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
        return;
      }
      if (!commandKey && !isTyping && event.key.toLowerCase() === "h") {
        event.preventDefault();
        tools.activate("hand");
        return;
      }
      if (!commandKey && !isTyping && event.key.toLowerCase() === "v") {
        event.preventDefault();
        tools.activate("select");
        return;
      }
      if (commandKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) historyManager.redo({ sceneGraph: commandGraph });
        else historyManager.undo({ sceneGraph: commandGraph });
      } else if (commandKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        historyManager.redo({ sceneGraph: commandGraph });
      } else if (commandKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copySelected();
      } else if (commandKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteClipboard();
      } else if (commandKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedIds.length && canDeleteCanvasSelection(event.target, editingId)) {
          event.preventDefault();
          deleteSelected();
        }
      } else if (event.key === "Escape") {
        tools.activate("select");
        selection.clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pageControls = (
    <section className="border-b border-[#444] pb-3">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="text-[10px] font-semibold uppercase text-[#9a9a9a]">Pages</div>
        {independentEditing ? <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-[10px] text-white hover:bg-white/10"
          onClick={() => setAddingPage((open) => !open)}
        >
          <Plus size={12} /> Add page
        </Button> : null}
      </div>
      {addingPage && independentEditing ? (
        <div className="mb-2 rounded border border-[#444] bg-[#242424] p-2">
          <Input
            autoFocus
            value={newPageTitle}
            onChange={(event) => setNewPageTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") createCustomPage();
              if (event.key === "Escape") setAddingPage(false);
            }}
            placeholder="Page title"
            className="h-8 border-[#555] bg-[#303030] text-xs text-white"
          />
          <div className="mt-2 flex justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[10px] text-[#c8c8c8] hover:bg-white/10"
              onClick={() => setAddingPage(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 bg-[#0178ff] px-3 text-[10px] text-white hover:bg-[#0b86df]"
              onClick={createCustomPage}
            >
              Create
            </Button>
          </div>
        </div>
      ) : null}
      <div className="space-y-0.5">
        {pageSnapshot?.document.pages.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => switchPage(page.id)}
            className={`flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs transition-colors ${
              page.id === pageSnapshot.activePageId
                ? "bg-[#0178ff] text-white"
                : "text-[#ededed] hover:bg-white/10"
            }`}
          >
            <span className="min-w-0 flex-1 truncate">{page.title}</span>
            <span className="text-[9px] uppercase opacity-70">{page.kind}</span>
          </button>
        ))}
      </div>
    </section>
  );

  if (loading) {
    return <div className="grid h-screen place-items-center bg-[#1f1f1f] text-sm text-white">Loading Editor...</div>;
  }

  if (loadError) {
    return (
      <div className="grid h-screen place-items-center bg-[#1f1f1f] p-6 text-white">
        <div className="w-full max-w-lg rounded-lg border border-[#444] bg-[#2c2c2c] p-6">
          <div className="text-lg font-semibold">Editor could not be loaded</div>
          <p className="mt-2 text-sm leading-6 text-[#cfcfcf]">{loadError}</p>
          <div className="mt-5 flex gap-2">
            <Button asChild variant="outline" className="border-[#555] bg-transparent text-white hover:bg-white/10">
              <Link to="/dashboard"><ArrowLeft size={14} className="mr-2" /> Back</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[#1f1f1f] text-white">
      <header className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-[#383838] bg-[#2c2c2c] px-2 sm:px-3">
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10 hover:text-white">
            <Link to="/dashboard"><ArrowLeft size={16} /></Link>
          </Button>
          <div className="hidden h-6 w-px bg-[#444] sm:block" />
          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-xs font-bold text-white">{profile?.business_name || "Store editor"}</div>
            <div className="truncate text-[10px] text-[#a8a8a8]">
              {activeStorePath || "Engine Scene"}
            </div>
          </div>
        </div>
        <BreakpointSwitcher
          activeBreakpoint={activeBreakpoint}
          onChange={changeBreakpoint}
          widths={sceneWidths}
        />
        <EditorModeSwitcher mode={editorMode} onChange={changeEditorMode} />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {headerActions}
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => historyManager.undo({ sceneGraph: commandGraph })} disabled={!canUndo}><Undo2 size={15} /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => historyManager.redo({ sceneGraph: commandGraph })} disabled={!canRedo}><Redo2 size={15} /></Button>
          <span
            className={`ml-2 hidden text-[10px] sm:inline ${
              saveStatus === "failed"
                ? "text-red-300"
                : saveStatus === "unsaved" || saveStatus === "publish-blocked"
                  ? "text-amber-300"
                  : "text-[#a8a8a8]"
            }`}
          >
            {{
              saved: "Saved",
              unsaved: "Unsaved changes",
              saving: "Saving...",
              failed: "Save failed",
              published: "Published",
              "publish-blocked": "Needs review",
            }[saveStatus]}
          </span>
          {storeSlug ? (
            <Button asChild size="sm" variant="ghost" className="ml-1 hidden h-8 gap-1 text-white hover:bg-white/10 sm:inline-flex">
              <Link to={activePreviewPath} target="_blank" rel="noreferrer"><Eye size={14} /> Preview</Link>
            </Button>
          ) : null}
          <Button size="sm" variant="outline" className="ml-1 h-8 gap-1 border-[#555] bg-transparent text-white hover:bg-white/10" onClick={save} disabled={saving || publishing}>
            <Save size={14} /> <span className="hidden sm:inline">{saving ? "Saving" : "Save"}</span>
          </Button>
          <Button size="sm" className="h-8 gap-1 bg-[#0178ff] px-2 text-white hover:bg-[#0b86df] sm:px-3" onClick={publish} disabled={saving || publishing}>
            {publishing ? "Publishing" : "Publish"}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Toggle inspector"
            aria-pressed={inspectorDrawerOpen}
            className="h-8 w-8 text-white hover:bg-white/10 xl:hidden"
            onClick={() => setInspectorDrawerOpen((open) => !open)}
          >
            <PanelRightOpen size={15} />
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] sm:grid-cols-[52px_minmax(0,1fr)] md:grid-cols-[52px_240px_minmax(0,1fr)] xl:grid-cols-[52px_260px_minmax(0,1fr)_300px]">
        <EditorRail
          activePanel={leftPanel}
          disabledPanels={independentEditing ? [] : ["tools"]}
          onPanelChange={(panel) => {
            setLeftPanel(panel);
            setSidebarDrawerOpen((open) => panel === leftPanel ? !open : true);
          }}
        />
        {sidebarDrawerOpen ? (
          <button
            type="button"
            aria-label="Close editor panel"
            className="fixed inset-0 bottom-14 z-30 bg-black/35 sm:bottom-0 md:hidden"
            onClick={() => setSidebarDrawerOpen(false)}
          />
        ) : null}
        <aside
          data-editor-structure-tree
          className={`${sidebarDrawerOpen ? "block" : "hidden"} fixed bottom-14 left-0 top-12 z-40 w-[min(300px,100vw)] min-h-0 overflow-y-auto border-r border-[#383838] bg-[#2c2c2c] shadow-2xl sm:bottom-0 sm:left-[52px] md:static md:block md:w-auto md:shadow-none`}
        >
          <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#383838] bg-[#2c2c2c] px-3 py-3">
            <div>
              <div className="text-sm font-semibold text-white">
              {{
                layers: "Pages & layers",
                templates: "Themes",
                tools: "Add",
                variables: "Brand",
                assist: "Quick actions",
              }[leftPanel]}
              </div>
              <div className="mt-1 text-[11px] leading-4 text-[#aaa]">
                {leftPanel === "layers"
                  ? `${displayedLayers.length} page items`
                  : leftPanel === "templates"
                    ? `Choose a look for ${activePage?.title ?? "this page"}`
                    : leftPanel === "tools"
                      ? "Add content to this page"
                      : leftPanel === "variables"
                        ? independentEditing ? "Brand and editor workspace" : "Brand typography"
                        : "View and selection shortcuts"}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close editor panel"
              className="h-7 w-7 text-white hover:bg-white/10 md:hidden"
              onClick={() => setSidebarDrawerOpen(false)}
            >
              <X size={14} />
            </Button>
          </div>
          <div className="p-2">
            {leftPanel === "templates" ? (
              <EngineTemplatePanel
                templates={ENGINE_SCENE_TEMPLATES}
                activeTemplateId={activeTemplateId}
                applyingTemplateId={applyingTemplateId}
                activePageName={activePage?.title ?? "Current page"}
                applicationBlockedReason={themeApplicationBlockedReason}
                onApply={(templateId) => {
                  void applyTemplate(templateId);
                }}
                recoveryPoints={recoveryPoints}
                restoringRecoveryPointId={restoringRecoveryPointId}
                onRestore={(recoveryPointId) => {
                  void restorePublication(recoveryPointId);
                }}
              />
            ) : leftPanel === "layers" ? (
              structuredScene ? (
                <div className="space-y-3">
                  {pageControls}
                  <div className="px-1 text-[10px] font-semibold uppercase text-[#9a9a9a]">Layers</div>
                  <StructuredLayerTree
                    layers={displayedLayers}
                    selectedIds={selectedIds}
                    activeBreakpoint={activeBreakpoint}
                    onSelect={selectStructuredNode}
                    onMove={(node, direction) => reorderStructuredNode(direction, node)}
                    onToggleHidden={setStructuredNodeHidden}
                    onDuplicate={duplicateStructuredNode}
                    onDelete={deleteStructuredNode}
                    onReorder={reorderStructuredTo}
                    onRename={renameStructuredNode}
                    onHover={(node) => selection.setHovered(node?.id ?? null)}
                    structureEditingEnabled={independentEditing}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {pageControls}
                  <div className="space-y-0.5">
                    {displayedLayers.map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => selection.select([node.id])}
                        className={`flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[12px] transition-colors ${
                          selectedIds.includes(node.id) ? "bg-[#0178ff] text-white" : "text-[#ededed] hover:bg-white/10"
                        }`}
                        style={{ paddingLeft: 8 + Number(node.extensions?.layerDepth ?? 0) * 14 }}
                      >
                        <span className="min-w-0 flex-1 truncate">{node.name}</span>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] uppercase text-[#d8d8d8]">{node.type}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            ) : leftPanel === "tools" ? (
              structuredScene ? (
                <div className="space-y-3">
                  <ComponentLibraryPanel
                    definitions={componentDefinitions}
                    onInsert={insertComponentFromLibrary}
                  />
                  {sectionActionError ? (
                    <p
                      role="alert"
                      className="rounded border border-red-500/40 bg-red-500/10 px-2 py-2 text-[10px] leading-4 text-red-200"
                    >
                      {sectionActionError}
                    </p>
                  ) : null}
                  <Input
                    value={sectionSearch}
                    onChange={(event) => setSectionSearch(event.target.value)}
                    placeholder="Search sections"
                    className="h-8 border-[#444] bg-[#242424] text-xs text-white placeholder:text-[#888]"
                  />
                  <select
                    value={sectionCategory}
                    aria-label="Filter section category"
                    onChange={(event) =>
                      setSectionCategory(event.target.value as SectionDefinition["category"] | "All")
                    }
                    className="h-8 w-full rounded border border-[#444] bg-[#242424] px-2 text-xs text-white outline-none focus:border-[#0178ff]"
                  >
                    {["All", "Header", "Hero", "Products", "Content", "Marketing", "Footer"].map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                  <select
                    value={sectionInsertMode}
                    aria-label="Section insertion position"
                    onChange={(event) => {
                      setSectionInsertMode(
                        event.target.value as SectionInsertMode,
                      );
                      setSectionActionError(null);
                    }}
                    className="h-8 w-full rounded border border-[#444] bg-[#242424] px-2 text-xs text-white outline-none focus:border-[#0178ff]"
                  >
                    <option value="page-end">Before page footer</option>
                    {selectedNode?.extensions?.editorKind === "section" ||
                    (selectedNode?.parentId &&
                      nodes[selectedNode.parentId]?.extensions?.editorKind ===
                        "section") ? (
                      <>
                        <option value="before">Before selected section</option>
                        <option value="after">After selected section</option>
                      </>
                    ) : null}
                    {selectedNode &&
                    sections.validatePlacement(
                      liveScene,
                      selectedNode.id,
                    ).valid ? (
                      <option value="inside">Inside selected container</option>
                    ) : null}
                  </select>
                  <div className="space-y-2">
                    {sectionLibrary.map((definition) => (
                      <div key={definition.type} className="rounded border border-[#444] bg-[#242424] p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase text-[#8f8f8f]">{definition.category}</div>
                            <div className="mt-0.5 text-xs font-semibold text-white">{definition.name}</div>
                            <p className="mt-1 text-[10px] leading-4 text-[#aaa]">{definition.description}</p>
                          </div>
                          <Button type="button" size="sm" className="h-7 shrink-0 bg-[#0178ff] px-2 text-[10px]" onClick={() => addStructuredSection(definition.type)}>
                            <Plus size={12} className="mr-1" /> Add
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {selectedNode && (
                    selectedNode.extensions?.editorKind === "section" ||
                    (selectedNode.parentId && nodes[selectedNode.parentId]?.extensions?.editorKind === "section")
                  ) ? (() => {
                    const sectionNode = selectedNode.extensions?.editorKind === "section" ? selectedNode : nodes[selectedNode.parentId as string];
                    const definition = sections.getSection(String(sectionNode.extensions?.sectionType ?? ""));
                    if (!definition) return null;
                    return (
                      <div className="border-t border-[#444] pt-3">
                        <div className="mb-2 text-[10px] font-semibold uppercase text-[#9a9a9a]">Add block to {sectionNode.name}</div>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.keys(definition.blocks)
                            .map((blockType) => (
                              <Button key={blockType} type="button" variant="outline" className="h-8 border-[#444] bg-transparent px-2 text-[10px] text-white hover:bg-white/10" onClick={() => addStructuredBlock(blockType)}>
                                <Plus size={11} className="mr-1" /> {definition.blocks[blockType].name}
                              </Button>
                            ))}
                        </div>
                      </div>
                    );
                  })() : null}
                </div>
              ) : (
              <div className="space-y-2">
                <ComponentLibraryPanel
                  definitions={componentDefinitions}
                  onInsert={insertComponentFromLibrary}
                />
                <button
                  type="button"
                  onClick={() => insertNode("text")}
                  className="flex h-10 w-full items-center gap-3 rounded border border-[#444] bg-[#242424] px-3 text-left text-xs text-white hover:bg-white/10"
                >
                  <Type size={15} className="text-[#b8b8b8]" />
                  Text
                </button>
                <button
                  type="button"
                  onClick={() => insertNode("shape")}
                  className="flex h-10 w-full items-center gap-3 rounded border border-[#444] bg-[#242424] px-3 text-left text-xs text-white hover:bg-white/10"
                >
                  <Square size={15} className="text-[#b8b8b8]" />
                  Shape
                </button>
                <button
                  type="button"
                  onClick={() => insertNode("button")}
                  className="flex h-10 w-full items-center gap-3 rounded border border-[#444] bg-[#242424] px-3 text-left text-xs text-white hover:bg-white/10"
                >
                  <Plus size={15} className="text-[#b8b8b8]" />
                  Button
                </button>
                <button
                  type="button"
                  onClick={() => insertNode("image")}
                  className="flex h-10 w-full items-center gap-3 rounded border border-[#444] bg-[#242424] px-3 text-left text-xs text-white hover:bg-white/10"
                >
                  <LayoutTemplate size={15} className="text-[#b8b8b8]" />
                  Image placeholder
                </button>
                <button
                  type="button"
                  onClick={() => insertNode(CUSTOM_CODE_NODE_TYPE)}
                  className="flex h-10 w-full items-center gap-3 rounded border border-[#444] bg-[#242424] px-3 text-left text-xs text-white hover:bg-white/10"
                >
                  <Code2 size={15} className="text-[#b8b8b8]" />
                  Custom React code
                </button>
              </div>
              )
            ) : leftPanel === "variables" ? (
              <div className="space-y-3">
                <ThemeBrandingPanel
                  settings={themeBrandingSettings}
                  onChange={updateThemeBranding}
                />
                {independentEditing ? (
                  <>
                    {structuredScene ? (
                      <section className="space-y-2 border-b border-[#444] pb-3">
                        <div className="text-[11px] font-semibold uppercase text-[#aaa]">Theme colors</div>
                        {(Object.entries(designTokenColors) as Array<[ThemeColorToken, string]>).map(([token, color]) => (
                          <label key={token} className="flex items-center justify-between rounded border border-[#444] bg-[#242424] px-3 py-2 text-xs capitalize text-white">
                            <span>{token}</span>
                            <input
                              type="color"
                              value={color}
                              onChange={(event) => updateDesignToken(token, event.target.value)}
                              className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent"
                            />
                          </label>
                        ))}
                      </section>
                    ) : null}
                    <label className="flex items-center justify-between rounded border border-[#444] bg-[#242424] px-3 py-2 text-xs text-white">
                      <span>Workspace</span>
                      <input
                        type="color"
                        value={editorStores.canvas.getState().background}
                        onChange={(event) => canvas.setBackground(event.target.value)}
                        className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent"
                      />
                    </label>
                    <Button variant="outline" className="h-9 w-full border-[#444] bg-transparent text-xs text-white hover:bg-white/10" onClick={() => canvas.toggleGrid()}>
                      {gridVisible ? "Hide grid" : "Show grid"}
                    </Button>
                    <Button variant="outline" className="h-9 w-full border-[#444] bg-transparent text-xs text-white hover:bg-white/10" onClick={() => canvas.toggleRulers()}>
                      {rulerVisible ? "Hide rulers" : "Show rulers"}
                    </Button>
                    <Button variant="outline" className="h-9 w-full border-[#444] bg-transparent text-xs text-white hover:bg-white/10" onClick={() => canvas.addGuide("y", 600)}>
                      Add horizontal guide
                    </Button>
                    <Button variant="outline" className="h-9 w-full border-[#444] bg-transparent text-xs text-white hover:bg-white/10" onClick={() => canvas.addGuide("x", 600)}>
                      Add vertical guide
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9 w-full border-[#444] bg-transparent text-xs text-white hover:bg-white/10"
                      onClick={() => canvas.clearGuides()}
                      disabled={guideCount === 0}
                    >
                      Clear guides ({guideCount})
                    </Button>
                  </>
                ) : (
                  <p className="rounded-md border border-[#444] bg-[#242424] px-3 py-2.5 text-xs leading-5 text-[#bbb]">
                    Layout colors, workspace, grids, rulers, and guides are available in Design mode.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Button className="h-9 w-full justify-start bg-[#0178ff] text-xs text-white hover:bg-[#0b86df]" onClick={fitPage}>
                  Fit page to view
                </Button>
                <Button variant="outline" className="h-9 w-full justify-start border-[#444] bg-transparent text-xs text-white hover:bg-white/10" onClick={selectAllEditable}>
                  Select all editable layers
                </Button>
                <Button variant="outline" className="h-9 w-full justify-start border-[#444] bg-transparent text-xs text-white hover:bg-white/10" onClick={() => selection.clearSelection()}>
                  Clear selection
                </Button>
                <Button variant="outline" className="h-9 w-full justify-start border-[#444] bg-transparent text-xs text-white hover:bg-white/10" onClick={() => tools.activate("hand")}>
                  Activate hand tool
                </Button>
                <div className="rounded border border-[#444] bg-[#242424] p-3 text-[11px] leading-5 text-[#b8b8b8]">
                  Hand mode moves the viewport only. Scene node positions and history remain unchanged.
                </div>
              </div>
            )}
          </div>
        </aside>

        <main ref={canvasPanelRef} className="relative min-w-0 bg-[#191919] pb-14 sm:pb-0">
          <SceneRenderErrorBoundary surfaceName="Editor preview">
            <CanvasShell
              rootNodeId={rootNodeId ?? undefined}
              className="h-full w-full"
              dynamicSourceData={editorDynamicSourceData}
              branding={appliedThemeBranding}
            />
          </SceneRenderErrorBoundary>
          <SelectionContextToolbar
            containerRef={canvasPanelRef}
            node={selectedNode}
            parent={selectedParent}
            sceneRevision={sceneRevision}
            activeBreakpoint={activeBreakpoint}
            hidden={
              selectedNode
                ? responsive.resolveNode(selectedNode, activeBreakpoint).meta.hidden
                : false
            }
            onMoveUp={() => {
              if (selectedNode?.extensions?.structured === true) reorderStructuredNode("up");
              else moveZ("front");
            }}
            onMoveDown={() => {
              if (selectedNode?.extensions?.structured === true) reorderStructuredNode("down");
              else moveZ("back");
            }}
            onDuplicate={duplicateSelected}
            onToggleHidden={() => {
              if (!selectedNode) return;
              const resolved = responsive.resolveNode(selectedNode, activeBreakpoint);
              setHidden(!resolved.meta.hidden);
            }}
            onDelete={deleteSelected}
            onSelectParent={selectStructuredNode}
            structureEditingEnabled={independentEditing}
          />
          <ConnectedCanvasToolDock
            activeTool={activeTool}
            gridVisible={gridVisible}
            onSelectTool={(tool) => tools.activate(tool)}
            onInsertText={(textPreset) => insertNode("text", { textPreset })}
            onInsertShape={(shapePreset) => insertNode("shape", { shapePreset })}
            onUploadImage={uploadImageNode}
            onInsertCode={() => insertNode(CUSTOM_CODE_NODE_TYPE)}
            onToggleGrid={() => canvas.toggleGrid()}
            insertEnabled={independentEditing}
          />
        </main>

        {inspectorDrawerOpen ? (
          <button
            type="button"
            aria-label="Close inspector"
            className="fixed inset-0 bottom-14 z-40 bg-black/35 sm:bottom-0 xl:hidden"
            onClick={() => setInspectorDrawerOpen(false)}
          />
        ) : null}
        <EngineInspectorPanel
          selectedNode={selectedNode}
          selectedParent={selectedParent}
          scene={liveScene}
          canvasBackground={editorStores.canvas.getState().background}
          gridVisible={gridVisible}
          activeBreakpoint={activeBreakpoint}
          editorMode={editorMode}
          brandColors={profile?.store_color ? [profile.store_color] : []}
          products={storeItems
            .filter((item) => item.id !== null && item.id !== undefined)
            .map((item) => ({ id: String(item.id), name: item.name || "Untitled product" }))}
          collections={Array.from(
            new Set(
              storeItems
                .map((item) => item.category?.trim())
                .filter((category): category is string => Boolean(category)),
            ),
          ).map((category) => ({ id: category, name: category }))}
          pages={(pageSnapshot?.document.pages ?? []).map((page) => ({
            id: page.id,
            name: page.title,
          }))}
          sections={Object.values(nodes)
            .filter(
              (node) =>
                node.extensions?.editorKind === "section" &&
                typeof node.extensions?.sectionInstanceId === "string",
            )
            .map((node) => ({
              id: String(node.extensions?.sectionInstanceId),
              name: node.name,
            }))}
          themeChromeSettings={themeChromeSettings}
          onRename={(name) => {
            if (selectedNode && canUseEditorCapability("structure", selectedNode)) {
              updateNodeField(selectedNode.id, "name", selectedNode.name, name);
            }
          }}
          onCopy={copySelected}
          onDuplicate={duplicateSelected}
          onMoveFront={() => moveZ("front")}
          onMoveBack={() => moveZ("back")}
          onReorderUp={() => reorderStructuredNode("up")}
          onReorderDown={() => reorderStructuredNode("down")}
          onToggleLock={toggleLock}
          onDelete={deleteSelected}
          onUpdateTransform={updateTransform}
          onUpdateLayout={updateLayout}
          onUpdateProps={updateProps}
          onUploadImage={replaceSelectedImage}
          onUpdateStyle={updateStyle}
          onUpdateExtensions={updateExtensions}
          onSetHidden={setHidden}
          onSetProductReference={setProductReference}
          onUpdateThemeChrome={updateThemeChrome}
          onUploadThemeLogo={uploadThemeLogo}
          onResetThemeLogoPlacement={resetThemeLogoPlacement}
          onUploadThemeMenuIcon={uploadThemeMenuIcon}
          onResetResponsiveOverride={resetResponsiveOverride}
          onResetResponsiveSetting={resetResponsiveSetting}
          onShareAcrossBreakpoints={shareSelectedAcrossBreakpoints}
          onSetCanvasBackground={(color) => canvas.setBackground(color)}
          onToggleGrid={() => canvas.toggleGrid()}
          onAddHorizontalGuide={() => canvas.addGuide("y", 600)}
          onAddVerticalGuide={() => canvas.addGuide("x", 600)}
          onApplyResponsiveDiagnostic={applyResponsiveDiagnostic}
          onEditBreakpoint={changeBreakpoint}
          onCreateComponent={createSelectedComponent}
          onUpdateComponentMaster={updateComponentMaster}
          onCreateComponentVariant={createComponentVariant}
          onCreateComponentInstance={createComponentInstance}
          onSwapComponentVariant={swapComponentVariant}
          onResetComponentOverrides={resetComponentOverrides}
          onDetachComponent={detachComponentInstance}
          drawerOpen={inspectorDrawerOpen}
          onRequestClose={() => setInspectorDrawerOpen(false)}
        />
      </div>
      <EditorRecoveryDialogs
        startupRecovery={startupRecovery}
        revisionConflict={revisionConflict}
        showDifferences={showRecoveryDifferences}
        onToggleDifferences={() => setShowRecoveryDifferences((visible) => !visible)}
        onRestore={() => void restoreStartupDraft()}
        onDiscard={() => void discardStartupDraft()}
        onResolveConflict={(resolution) => void resolveVisibleConflict(resolution)}
      />
    </div>
  );
};

export default EngineEditor;
