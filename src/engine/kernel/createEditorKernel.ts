import { AssetSystem, getAssetManager } from "@/assets/system";
import { PaletteSystem } from "@/assets/palettes";
import { NavigationSystem } from "@/content/menus";
import { AnimationSystem } from "@/document/animation";
import { createComponentSystem } from "@/document/components";
import { createPageDocumentSystem } from "@/document/pages";
import { createSectionRegistry } from "@/document/sections";
import { createCommandManager } from "@/engine/command";
import { createDependencyGraph, SceneDependencyIndexer } from "@/engine/dependency-graph";
import { createHistoryManager } from "@/engine/history";
import { createEditorDocumentMigrationSystem } from "@/engine/migration";
import { createBuiltInNodeSchemaRegistry } from "@/engine/node-schema";
import { createTransactionManager } from "@/engine/transaction";
import { createInteractionElevationSystem } from "@/interaction/elevation";
import { createEditorModeSystem } from "@/interaction/modes";
import { createSelectionSystem } from "@/interaction/selection";
import { createToolSystem } from "@/interaction/tools";
import { createTelemetrySystem } from "@/infrastructure/telemetry";
import { createTransformSystem } from "@/interaction/transform";
import { createResponsiveDiagnosticsSystem } from "@/layout/diagnostics";
import { createLayoutEngine } from "@/layout/engine";
import { createIntrinsicMeasurementSystem } from "@/layout/measurement";
import { createResponsiveSystem, createResponsiveSceneGraphView } from "@/layout/responsive";
import { createResponsiveRuleRegistry } from "@/layout/rules";
import { StructuredLayoutSystem } from "@/layout/structured";
import { createCanvasSystem } from "@/rendering/canvas";
import { getAABB, unionBounds } from "@/rendering/geometry";
import { createHitTestingSystem } from "@/rendering/hit-testing";
import { createRendererSystem } from "@/rendering/renderer";
import { createViewportSystem } from "@/rendering/viewport";
import { createStorefrontPublishingService } from "@/platform/publishing";
import { createEditorStoreDataService } from "@/platform/editor-data";
import { createEditorRecoverySystem } from "@/persistence/recovery";
import { storefrontDataResolver } from "@/storefront/data-resolvers";
import { createEditorRuntimeStores } from "@/stores/editorRuntimeStores";
import { createSceneStoreCommandGraph, createSceneStoreGraph } from "@/stores/sceneGraphAdapter";
import { ThemeChromeSystem } from "@/theme-engine/chrome";
import { ThemeBrandingSystem } from "@/theme-engine/branding";
import type { SceneTree } from "@/types";
import { createEngineKernel } from "./EngineKernel";
import { EDITOR_SYSTEM_KEYS } from "./systemKeys";

export type CreateEditorKernelOptions = {
  initialScene?: SceneTree | null;
};

export const createEditorKernel = (options: CreateEditorKernelOptions = {}) => {
  const kernel = createEngineKernel();
  const eventBus = kernel.getEventBus();
  const stores = createEditorRuntimeStores();
  if (options.initialScene) {
    stores.scene.getState().replaceSceneFromEngine(options.initialScene);
  }
  const telemetrySystem = createTelemetrySystem();
  const recoverySystem = createEditorRecoverySystem({
    onStorageError: (error) => {
      telemetrySystem.track("editor.recovery.storage-failed", {
        error: error instanceof Error ? error.message : String(error),
      }, {
        level: "error",
      });
    },
  });
  const historyManager = createHistoryManager({
    onApplied: (action, command) => {
      void recoverySystem.recordCommand(command, action).catch(() => undefined);
    },
  });
  const commandManager = createCommandManager({
    historyManager,
    onExecuted: (command) => {
      telemetrySystem.track("editor.command.executed", {
        commandId: command.id,
        commandType: command.type,
        commandLabel: command.label,
      }, { level: "info", correlationId: command.id });
      void recoverySystem.recordCommand(command, "execute").catch(() => undefined);
    },
    onFailed: (command, error) => {
      telemetrySystem.track("editor.command.failed", {
        commandId: command.id,
        commandType: command.type,
        commandLabel: command.label,
        error: error instanceof Error ? error.message : String(error),
      }, { level: "error", correlationId: command.id });
    },
  });
  const nodeSchemaRegistry = createBuiltInNodeSchemaRegistry();
  const migrationSystem = createEditorDocumentMigrationSystem(nodeSchemaRegistry);
  const transactionManager = createTransactionManager(commandManager);
  const dependencyGraph = createDependencyGraph();
  const publishingSystem = createStorefrontPublishingService({
    dependencies: dependencyGraph,
  });
  const editorDataSystem = createEditorStoreDataService();
  const themeChromeSystem = new ThemeChromeSystem();
  const themeBrandingSystem = new ThemeBrandingSystem();
  const componentSystem = createComponentSystem();
  const sceneGraph = createSceneStoreGraph(stores.scene);
  const commandSceneGraph = createSceneStoreCommandGraph(stores.scene, eventBus, nodeSchemaRegistry);
  const responsiveSystem = createResponsiveSystem(stores.responsive);
  const intrinsicMeasurementSystem = createIntrinsicMeasurementSystem();
  const responsiveRuleRegistry = createResponsiveRuleRegistry();
  const layoutEngine = createLayoutEngine({
    responsive: responsiveSystem,
    measurement: intrinsicMeasurementSystem,
    rules: responsiveRuleRegistry,
  });
  const structuredLayoutSystem = new StructuredLayoutSystem(responsiveSystem, layoutEngine);
  const responsiveDiagnosticsSystem = createResponsiveDiagnosticsSystem({
    responsive: responsiveSystem,
    layout: layoutEngine,
    measurement: intrinsicMeasurementSystem,
    rules: responsiveRuleRegistry,
  });
  const responsiveSceneGraph = createResponsiveSceneGraphView(sceneGraph, responsiveSystem);
  const selectionSystem = createSelectionSystem({
    sceneGraph: responsiveSceneGraph,
    eventBus,
    store: stores.selection,
  });
  const editorModeSystem = createEditorModeSystem();
  const elevationSystem = createInteractionElevationSystem(stores.transform);
  const transformSystem = createTransformSystem({
    sceneGraph,
    readSceneGraph: responsiveSceneGraph,
    commandContext: { sceneGraph: commandSceneGraph },
    commandManager,
    store: stores.transform,
    responsiveSystem,
    elevationSystem,
    canTransformNode: (node) => editorModeSystem.can("transform", node),
  });
  const hitTestingSystem = createHitTestingSystem({ sceneGraph: responsiveSceneGraph, eventBus });
  const rendererSystem = createRendererSystem();
  rendererSystem.connectEventBus(eventBus);
  const canvasSystem = createCanvasSystem(stores.canvas);
  const viewportSystem = createViewportSystem({
    store: stores.viewport,
    contentBoundsResolver: (nodeIds) => {
      const tree = sceneGraph.serializeTree();
      const targetIds = nodeIds?.length ? nodeIds : tree.rootNodeId ? [tree.rootNodeId] : [];
      const bounds = targetIds
        .map((nodeId) => tree.nodes[nodeId])
        .filter((node) => Boolean(node) && !node.meta.hidden)
        .map((node) => responsiveSystem.resolveNode(node))
        .map(getAABB);
      return bounds.length ? unionBounds(bounds) : null;
    },
  });
  const toolSystem = createToolSystem(stores.tool);
  const dependencyIndexer = new SceneDependencyIndexer(dependencyGraph, sceneGraph, eventBus);

  kernel.register(EDITOR_SYSTEM_KEYS.stores, stores);
  kernel.register(EDITOR_SYSTEM_KEYS.commands, commandManager);
  kernel.register(EDITOR_SYSTEM_KEYS.history, historyManager);
  kernel.register(EDITOR_SYSTEM_KEYS.nodeSchemas, nodeSchemaRegistry);
  kernel.register(EDITOR_SYSTEM_KEYS.migrations, migrationSystem);
  kernel.register(EDITOR_SYSTEM_KEYS.recovery, recoverySystem);
  kernel.register(EDITOR_SYSTEM_KEYS.transactions, transactionManager);
  kernel.register(EDITOR_SYSTEM_KEYS.dependencies, dependencyGraph);
  kernel.register(EDITOR_SYSTEM_KEYS.dependencyIndexer, dependencyIndexer);
  kernel.register(EDITOR_SYSTEM_KEYS.publishing, publishingSystem);
  kernel.register(EDITOR_SYSTEM_KEYS.editorData, editorDataSystem);
  kernel.register(EDITOR_SYSTEM_KEYS.storefrontData, storefrontDataResolver);
  kernel.register(EDITOR_SYSTEM_KEYS.telemetry, telemetrySystem);
  kernel.register(EDITOR_SYSTEM_KEYS.canvas, canvasSystem);
  kernel.register(EDITOR_SYSTEM_KEYS.viewport, viewportSystem);
  kernel.register(EDITOR_SYSTEM_KEYS.renderer, rendererSystem);
  kernel.register(EDITOR_SYSTEM_KEYS.selection, selectionSystem);
  kernel.register(EDITOR_SYSTEM_KEYS.editorMode, editorModeSystem);
  kernel.register(EDITOR_SYSTEM_KEYS.transform, transformSystem);
  kernel.register(EDITOR_SYSTEM_KEYS.tools, toolSystem);
  kernel.register(EDITOR_SYSTEM_KEYS.palette, new PaletteSystem());
  kernel.register(EDITOR_SYSTEM_KEYS.assets, new AssetSystem());
  kernel.register(EDITOR_SYSTEM_KEYS.assetManager, getAssetManager());
  kernel.register(EDITOR_SYSTEM_KEYS.intrinsicMeasurement, intrinsicMeasurementSystem);
  kernel.register(EDITOR_SYSTEM_KEYS.responsiveRules, responsiveRuleRegistry);
  kernel.register(EDITOR_SYSTEM_KEYS.layoutEngine, layoutEngine);
  kernel.register(EDITOR_SYSTEM_KEYS.responsiveDiagnostics, responsiveDiagnosticsSystem);
  kernel.register(EDITOR_SYSTEM_KEYS.responsive, responsiveSystem);
  kernel.register(EDITOR_SYSTEM_KEYS.structuredLayout, structuredLayoutSystem);
  kernel.register(EDITOR_SYSTEM_KEYS.sections, createSectionRegistry());
  kernel.register(EDITOR_SYSTEM_KEYS.pages, createPageDocumentSystem(componentSystem));
  kernel.register(EDITOR_SYSTEM_KEYS.components, componentSystem);
  kernel.register(EDITOR_SYSTEM_KEYS.navigation, new NavigationSystem());
  kernel.register(EDITOR_SYSTEM_KEYS.animation, new AnimationSystem());
  kernel.register(EDITOR_SYSTEM_KEYS.themeChrome, themeChromeSystem);
  kernel.register(EDITOR_SYSTEM_KEYS.themeBranding, themeBrandingSystem);
  kernel.register(EDITOR_SYSTEM_KEYS.hitTesting, hitTestingSystem);
  kernel.register(EDITOR_SYSTEM_KEYS.sceneGraph, sceneGraph);
  kernel.register(EDITOR_SYSTEM_KEYS.resolvedSceneGraph, responsiveSceneGraph);
  kernel.register(EDITOR_SYSTEM_KEYS.commandSceneGraph, commandSceneGraph);

  return kernel;
};
