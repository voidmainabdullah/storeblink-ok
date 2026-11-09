import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useStore } from "zustand";
import { EDITOR_SYSTEM_KEYS } from "@/engine/kernel/systemKeys";
import { useEditorStores } from "@/engine/kernel/useEditorStores";
import { useEngineContext } from "@/engine/kernel/useEngine";
import { FigmaColorPicker } from "@/editor/components/toolbars/FigmaColorPicker";
import type { SettingDefinition } from "@/document/sections";
import { canTransformNode } from "@/interaction/transform/capabilities";
import type { ResponsiveDiagnostic } from "@/layout/diagnostics";
import { RESPONSIVE_BREAKPOINTS, type ResponsiveSystem } from "@/layout/responsive";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import {
  themeChromeNodeSlot,
  type ThemeChromeSettings,
  type ThemeLogoAssetSlot,
} from "@/theme-engine/chrome";
import type { LayoutData, SceneNode, SceneTree, TransformData } from "@/types";
import type { EditorMode } from "@/interaction/modes";
import { AppearanceInspector } from "./AppearanceInspector";
import { ComponentInspector } from "./ComponentInspector";
import { CustomCodeInspector } from "./CustomCodeInspector";
import { ImageInspector } from "./ImageInspector";
import { InspectorHeader } from "./InspectorHeader";
import { InspectorSection } from "./InspectorControls";
import { LayoutInspector } from "./LayoutInspector";
import { NavigationTargetControl } from "./NavigationTargetControl";
import { ResponsiveDiagnosticsPanel } from "./ResponsiveDiagnosticsPanel";
import {
  StructuredInspectorFields,
  type StructuredNavigationOption,
  type StructuredProductOption,
} from "./StructuredInspectorFields";
import { ThemeChromeInspector } from "./ThemeChromeInspector";
import { TransformInspector } from "./TransformInspector";
import { TypographyInspector } from "./TypographyInspector";

export type EngineInspectorPanelProps = {
  selectedNode: SceneNode | null;
  selectedParent: SceneNode | null;
  scene: SceneTree;
  canvasBackground: string;
  gridVisible: boolean;
  activeBreakpoint: ResponsiveBreakpoint;
  brandColors?: string[];
  products?: StructuredProductOption[];
  collections?: StructuredNavigationOption[];
  pages?: StructuredNavigationOption[];
  sections?: StructuredNavigationOption[];
  themeChromeSettings: ThemeChromeSettings;
  onRename: (name: string) => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onMoveFront: () => void;
  onMoveBack: () => void;
  onReorderUp: () => void;
  onReorderDown: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
  onUpdateTransform: (patch: Partial<TransformData>) => void;
  onUpdateLayout: (layout: LayoutData) => void;
  onUpdateProps: (patch: Record<string, unknown>) => void;
  onUploadImage: (file: File) => Promise<void>;
  onUpdateStyle: (patch: Partial<SceneNode["style"]>) => void;
  onUpdateExtensions: (patch: Record<string, unknown>) => void;
  onSetHidden: (hidden: boolean) => void;
  onSetProductReference: (productId: string) => void;
  onUpdateThemeChrome: (settings: ThemeChromeSettings) => void;
  onUploadThemeLogo: (file: File, slot: ThemeLogoAssetSlot) => Promise<void>;
  onResetThemeLogoPlacement: () => void;
  onUploadThemeMenuIcon: (file: File) => Promise<void>;
  onResetResponsiveOverride: () => void;
  onResetResponsiveSetting: (setting: SettingDefinition) => void;
  onShareAcrossBreakpoints: () => void;
  onSetCanvasBackground: (color: string) => void;
  onToggleGrid: () => void;
  onAddHorizontalGuide: () => void;
  onAddVerticalGuide: () => void;
  onApplyResponsiveDiagnostic: (diagnostic: ResponsiveDiagnostic) => void;
  onEditBreakpoint: (breakpoint: ResponsiveBreakpoint) => void;
  onCreateComponent: () => void;
  onUpdateComponentMaster: (definitionId: string) => void;
  onCreateComponentVariant: (definitionId: string, name: string) => void;
  onCreateComponentInstance: (definitionId: string) => void;
  onSwapComponentVariant: (instanceRootId: string, variantId: string) => void;
  onResetComponentOverrides: (instanceRootId: string) => void;
  onDetachComponent: (instanceRootId: string) => void;
  drawerOpen?: boolean;
  onRequestClose?: () => void;
  editorMode?: EditorMode;
};

export const EngineInspectorPanel = ({
  selectedNode,
  selectedParent,
  scene,
  canvasBackground,
  gridVisible,
  activeBreakpoint,
  brandColors = [],
  products = [],
  collections = [],
  pages = [],
  sections = [],
  themeChromeSettings,
  onRename,
  onCopy,
  onDuplicate,
  onMoveFront,
  onMoveBack,
  onReorderUp,
  onReorderDown,
  onToggleLock,
  onDelete,
  onUpdateTransform,
  onUpdateLayout,
  onUpdateProps,
  onUploadImage,
  onUpdateStyle,
  onUpdateExtensions,
  onSetHidden,
  onSetProductReference,
  onUpdateThemeChrome,
  onUploadThemeLogo,
  onResetThemeLogoPlacement,
  onUploadThemeMenuIcon,
  onResetResponsiveOverride,
  onResetResponsiveSetting,
  onShareAcrossBreakpoints,
  onSetCanvasBackground,
  onToggleGrid,
  onAddHorizontalGuide,
  onAddVerticalGuide,
  onApplyResponsiveDiagnostic,
  onEditBreakpoint,
  onCreateComponent,
  onUpdateComponentMaster,
  onCreateComponentVariant,
  onCreateComponentInstance,
  onSwapComponentVariant,
  onResetComponentOverrides,
  onDetachComponent,
  drawerOpen = false,
  onRequestClose,
  editorMode = "independent",
}: EngineInspectorPanelProps) => {
  const engine = useEngineContext();
  const stores = useEditorStores();
  const responsive = engine.resolveSystem<ResponsiveSystem>(
    EDITOR_SYSTEM_KEYS.responsive,
  );
  const resolvedNode = selectedNode
    ? responsive.resolveNode(selectedNode, activeBreakpoint)
    : null;
  const resolvedParent = selectedParent
    ? responsive.resolveNode(selectedParent, activeBreakpoint)
    : null;
  const previewTransform = useStore(stores.transform, (state) =>
    selectedNode ? state.previewTransforms[selectedNode.id] : undefined,
  );
  const inspectorNode =
    resolvedNode && previewTransform
      ? { ...resolvedNode, transform: previewTransform }
      : resolvedNode;
  const structuredNode = inspectorNode?.extensions?.structured === true;
  const transformable = selectedNode ? canTransformNode(selectedNode) : false;
  const fixedMode = editorMode === "fixed";
  const chromeSlot = themeChromeNodeSlot(inspectorNode ?? undefined);

  if (fixedMode) {
    const fixedContent = inspectorNode && selectedNode ? (
      chromeSlot === "logo" || chromeSlot === "logo-fallback" ? (
        <ThemeChromeInspector
          node={inspectorNode}
          settings={themeChromeSettings}
          activeBreakpoint={activeBreakpoint}
          brandColors={brandColors}
          onChange={onUpdateThemeChrome}
          onUploadLogo={onUploadThemeLogo}
          onResetLogoPlacement={onResetThemeLogoPlacement}
          onUploadMenuIcon={onUploadThemeMenuIcon}
          products={products}
          collections={collections}
          pages={pages}
          sections={sections}
          contentOnly
        />
      ) : inspectorNode.type === "image" ? (
        <ImageInspector
          node={inspectorNode}
          brandColors={brandColors}
          onUpdateProps={onUpdateProps}
          onUploadImage={onUploadImage}
          replaceOnly
        />
      ) : inspectorNode.type === "text" || inspectorNode.type === "button" ? (
        <TypographyInspector
          node={inspectorNode}
          brandColors={brandColors}
          onUpdateProps={onUpdateProps}
          contentOnly
        />
      ) : (
        <div className="m-3 rounded border border-[#444] bg-[#262626] p-3 text-[10px] leading-5 text-[#aaa]">
          This layer is protected in Fixed mode. Select text, a navigation label, a logo, or an image to edit content.
        </div>
      )
    ) : (
      <div className="space-y-3 p-3">
        <p className="rounded border border-[#444] bg-[#262626] p-3 text-[10px] leading-5 text-[#aaa]">
          Select text, a navigation label, a logo, or an image. Layout and structure remain protected.
        </p>
        <ThemeChromeInspector
          settings={themeChromeSettings}
          activeBreakpoint={activeBreakpoint}
          brandColors={brandColors}
          onChange={onUpdateThemeChrome}
          onUploadLogo={onUploadThemeLogo}
          onResetLogoPlacement={onResetThemeLogoPlacement}
          onUploadMenuIcon={onUploadThemeMenuIcon}
          products={products}
          collections={collections}
          pages={pages}
          sections={sections}
          contentOnly
        />
      </div>
    );

    return (
      <aside
        aria-label="Inspector"
        className={`${drawerOpen ? "block" : "hidden"} fixed bottom-14 right-0 top-12 z-50 w-[min(320px,100vw)] min-h-0 overflow-y-auto border-l border-[#414141] bg-[#2c2c2c] text-white shadow-2xl sm:bottom-0 xl:static xl:block xl:w-auto xl:shadow-none`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#414141] bg-[#2c2c2c] px-3 py-3">
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold">{inspectorNode?.name ?? "Fixed editor"}</div>
            <div className="mt-0.5 text-[9px] text-[#949494]">Content-safe controls</div>
          </div>
          {onRequestClose ? (
            <Button type="button" variant="ghost" size="icon" aria-label="Close inspector" className="h-7 w-7 text-white hover:bg-white/10 xl:hidden" onClick={onRequestClose}>
              <X size={13} />
            </Button>
          ) : null}
        </div>
        {fixedContent}
      </aside>
    );
  }

  return (
    <aside
      aria-label="Inspector"
      className={`${drawerOpen ? "block" : "hidden"} fixed bottom-14 right-0 top-12 z-50 w-[min(320px,100vw)] min-h-0 overflow-y-auto border-l border-[#414141] bg-[#2c2c2c] text-white shadow-2xl sm:bottom-0 xl:static xl:block xl:w-auto xl:shadow-none`}
    >
      {inspectorNode && selectedNode ? (
        <>
          <InspectorHeader
            node={inspectorNode}
            onRename={onRename}
            onUpdateExtensions={onUpdateExtensions}
            onSetHidden={onSetHidden}
            onToggleLock={onToggleLock}
            onCopy={onCopy}
            onDuplicate={onDuplicate}
            onMoveFront={structuredNode ? onReorderUp : onMoveFront}
            onMoveBack={structuredNode ? onReorderDown : onMoveBack}
            onDelete={onDelete}
            onRequestClose={onRequestClose}
          />

          <ComponentInspector
            node={selectedNode}
            scene={scene}
            onCreate={onCreateComponent}
            onUpdateMaster={onUpdateComponentMaster}
            onCreateVariant={onCreateComponentVariant}
            onCreateInstance={onCreateComponentInstance}
            onSwapVariant={onSwapComponentVariant}
            onResetOverrides={onResetComponentOverrides}
            onDetach={onDetachComponent}
          />

          {transformable ? (
            <TransformInspector
              node={inspectorNode}
              parent={resolvedParent}
              breakpointLabel={RESPONSIVE_BREAKPOINTS[activeBreakpoint].label}
              onUpdateTransform={onUpdateTransform}
              onUpdateProps={onUpdateProps}
              onUpdateExtensions={onUpdateExtensions}
            />
          ) : null}

          <LayoutInspector node={inspectorNode} onChange={onUpdateLayout} />

          <ThemeChromeInspector
            node={inspectorNode}
            settings={themeChromeSettings}
            activeBreakpoint={activeBreakpoint}
            brandColors={brandColors}
            onChange={onUpdateThemeChrome}
            onUploadLogo={onUploadThemeLogo}
            onResetLogoPlacement={onResetThemeLogoPlacement}
            onUploadMenuIcon={onUploadThemeMenuIcon}
            products={products}
            collections={collections}
            pages={pages}
            sections={sections}
          />

          {inspectorNode.type === "button" && !structuredNode ? (
            <InspectorSection title="Destination">
              <NavigationTargetControl
                value={inspectorNode.extensions?.navigationTarget}
                products={products}
                collections={collections}
                pages={pages}
                sections={sections}
                onChange={(target) => onUpdateExtensions({ navigationTarget: target })}
              />
            </InspectorSection>
          ) : null}

          {structuredNode ? (
            <div className="px-3 py-3">
              <StructuredInspectorFields
                node={inspectorNode}
                sourceNode={selectedNode}
                activeBreakpoint={activeBreakpoint}
                brandColors={brandColors}
                products={products}
                collections={collections}
                pages={pages}
                sections={sections}
                onUpdateProps={onUpdateProps}
                onUploadImage={onUploadImage}
                onUpdateTransform={onUpdateTransform}
                onUpdateStyle={onUpdateStyle}
                onUpdateExtensions={onUpdateExtensions}
                onSetHidden={onSetHidden}
                onSetProductReference={onSetProductReference}
                onResetResponsiveOverride={onResetResponsiveOverride}
                onResetResponsiveSetting={onResetResponsiveSetting}
                excludedGroups={
                  inspectorNode.type === "text" || inspectorNode.type === "button"
                    ? ["appearance", "typography"]
                    : ["appearance"]
                }
                excludedControls={inspectorNode.type === "image" ? ["image"] : []}
                excludedSettingIds={
                  inspectorNode.type === "text"
                    ? ["text"]
                    : inspectorNode.type === "button"
                      ? ["label"]
                      : inspectorNode.type === "image"
                        ? ["src", "objectFit"]
                        : []
                }
              />
            </div>
          ) : null}

          {inspectorNode.type === "image" && themeChromeNodeSlot(inspectorNode) !== "logo" ? (
            <ImageInspector
              node={inspectorNode}
              brandColors={brandColors}
              onUpdateProps={onUpdateProps}
              onUploadImage={onUploadImage}
              appearanceBefore={
                <AppearanceInspector
                  node={inspectorNode}
                  brandColors={brandColors}
                  showStroke={false}
                  showEffects={false}
                  onUpdateProps={onUpdateProps}
                  onUpdateStyle={onUpdateStyle}
                />
              }
              strokeEffectsAfter={
                <AppearanceInspector
                  node={inspectorNode}
                  brandColors={brandColors}
                  showAppearance={false}
                  showFill={false}
                  onUpdateProps={onUpdateProps}
                  onUpdateStyle={onUpdateStyle}
                />
              }
            />
          ) : null}

          {inspectorNode.type !== "image" || themeChromeNodeSlot(inspectorNode) === "logo" ? (
            <AppearanceInspector
              node={inspectorNode}
              brandColors={brandColors}
              showFill={inspectorNode.type !== "text"}
              onUpdateProps={onUpdateProps}
              onUpdateStyle={onUpdateStyle}
            />
          ) : null}

          {inspectorNode.type === "custom:code" ? (
            <CustomCodeInspector
              node={inspectorNode}
              onUpdateProps={onUpdateProps}
            />
          ) : null}

          {(inspectorNode.type === "text" || inspectorNode.type === "button") ? (
            <TypographyInspector
              node={inspectorNode}
              brandColors={brandColors}
              onUpdateProps={onUpdateProps}
            />
          ) : null}

          <ResponsiveDiagnosticsPanel
            scene={scene}
            breakpoint={activeBreakpoint}
            selectedNodeId={selectedNode.id}
            onApplyFix={onApplyResponsiveDiagnostic}
            onEditBreakpoint={onEditBreakpoint}
          />

          <InspectorSection title="Hierarchy" defaultOpen={false}>
            <div className="rounded bg-[#383838] p-2 text-[10px] text-[#d8d8d8]">
              Parent: {resolvedParent?.name ?? "None"}
            </div>
            <Button
              variant="outline"
              className="h-8 w-full border-[#4a4a4a] bg-transparent text-[10px] text-white hover:bg-white/10"
              onClick={onShareAcrossBreakpoints}
            >
              Apply current layout to all modes
            </Button>
          </InspectorSection>
        </>
      ) : (
        <>
          <div className="sticky top-0 z-10 border-b border-[#414141] bg-[#2c2c2c] px-3 py-3">
            <div className="text-[11px] font-semibold">Page settings</div>
            <div className="mt-1 text-[9px] text-[#949494]">Canvas and scene</div>
          </div>
          <ThemeChromeInspector
            settings={themeChromeSettings}
            activeBreakpoint={activeBreakpoint}
            brandColors={brandColors}
            onChange={onUpdateThemeChrome}
            onUploadLogo={onUploadThemeLogo}
            onResetLogoPlacement={onResetThemeLogoPlacement}
            onUploadMenuIcon={onUploadThemeMenuIcon}
            products={products}
            collections={collections}
            pages={pages}
            sections={sections}
          />
          <InspectorSection title="Canvas">
            <div className="flex items-center justify-between rounded bg-[#383838] px-2 py-1">
              <span className="text-[10px]">Background</span>
              <FigmaColorPicker
                value={canvasBackground}
                label="Canvas background"
                brandColors={brandColors}
                onChange={onSetCanvasBackground}
              />
            </div>
            <Button variant="outline" className="h-8 w-full border-[#4a4a4a] bg-transparent text-[10px] text-white hover:bg-white/10" onClick={onToggleGrid}>
              {gridVisible ? "Hide grid" : "Show grid"}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-8 border-[#4a4a4a] bg-transparent px-1 text-[9px] text-white hover:bg-white/10" onClick={onAddHorizontalGuide}>
                Horizontal guide
              </Button>
              <Button variant="outline" className="h-8 border-[#4a4a4a] bg-transparent px-1 text-[9px] text-white hover:bg-white/10" onClick={onAddVerticalGuide}>
                Vertical guide
              </Button>
            </div>
          </InspectorSection>
          <ResponsiveDiagnosticsPanel
            scene={scene}
            breakpoint={activeBreakpoint}
            onApplyFix={onApplyResponsiveDiagnostic}
            onEditBreakpoint={onEditBreakpoint}
          />
        </>
      )}
    </aside>
  );
};
