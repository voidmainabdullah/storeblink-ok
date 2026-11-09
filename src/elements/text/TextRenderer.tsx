import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import {
  createFieldUpdateCommand,
  createSceneReplaceCommand,
  type Command,
  type CommandManager,
} from "@/engine/command";
import { EDITOR_SYSTEM_KEYS } from "@/engine/kernel/systemKeys";
import { useOptionalEditorStores } from "@/engine/kernel/useEditorStores";
import { useOptionalEngineContext } from "@/engine/kernel/useEngine";
import type { SceneGraphAPI } from "@/engine/scene-graph";
import type { SelectionSystem } from "@/interaction/selection/state";
import {
  useOptionalEditorMode,
  type EditorModeSystemAPI,
} from "@/interaction/modes";
import type { LayoutEngine } from "@/layout/engine";
import { responsiveSystem, type ResponsiveSystem } from "@/layout/responsive";
import type { StructuredLayoutSystem } from "@/layout/structured";
import type { SceneNode } from "@/types";
import { getNodeDomId, getNodeFrameStyle } from "@/rendering/renderer/style";
import { themeChromeNodeSlot } from "@/theme-engine/chrome";
import { useStore } from "zustand";

export type TextRendererProps = {
  node: SceneNode;
};

export const TextRenderer = memo(({ node }: TextRendererProps) => {
  const engineContext = useOptionalEngineContext();
  const stores = useOptionalEditorStores();
  const editorRef = useRef<HTMLElement>(null);
  const skipNextCommitRef = useRef(false);
  const text = String(node.props.text ?? node.props.content ?? node.name);
  const commandGraph = useMemo(
    () => engineContext?.tryResolveSystem<SceneGraphAPI>(EDITOR_SYSTEM_KEYS.commandSceneGraph),
    [engineContext],
  );
  const commandManager = engineContext?.tryResolveSystem<CommandManager>(EDITOR_SYSTEM_KEYS.commands);
  const selection = engineContext?.tryResolveSystem<SelectionSystem>(EDITOR_SYSTEM_KEYS.selection);
  const editorModeSystem = engineContext?.tryResolveSystem<EditorModeSystemAPI>(
    EDITOR_SYSTEM_KEYS.editorMode,
  );
  const editorMode = useOptionalEditorMode();
  const responsive = engineContext?.tryResolveSystem<ResponsiveSystem>(EDITOR_SYSTEM_KEYS.responsive) ?? responsiveSystem;
  const layoutEngine = engineContext?.tryResolveSystem<LayoutEngine>(EDITOR_SYSTEM_KEYS.layoutEngine);
  const structuredLayout = engineContext?.tryResolveSystem<StructuredLayoutSystem>(
    EDITOR_SYSTEM_KEYS.structuredLayout,
  );
  const dispatchCommand = useCallback((command: Command) => {
    if (!commandGraph || !commandManager) return;
    commandManager.dispatch(command, { sceneGraph: commandGraph });
  }, [commandGraph, commandManager]);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(text);
  const resizeMode = String(node.props.textResizeMode ?? "fixed");
  const transformActive = useStore(stores.transform, (state) => Boolean(state.previewTransforms[node.id]));
  const textColor = String(node.props.color ?? "#111827");
  const textFillOpacity = Math.max(0, Math.min(100, Number(node.props.textFillOpacity ?? 100)));
  const canEditContent = editorModeSystem
    ? editorModeSystem.can("edit-content", node)
    : editorMode === "independent";

  useEffect(() => {
    if (!isEditing) setDraftText(text);
  }, [isEditing, text]);

  useEffect(() => {
    if (!isEditing) return;
    const frameId = window.requestAnimationFrame(() => {
      const element = editorRef.current;
      if (!element) return;
      element.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const documentSelection = window.getSelection();
      documentSelection?.removeAllRanges();
      documentSelection?.addRange(range);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isEditing]);

  useLayoutEffect(() => {
    if (!commandGraph || isEditing || transformActive || resizeMode === "fixed") return;
    if (
      node.layout.sizing?.width?.mode === "hug" ||
      node.layout.sizing?.height?.mode === "hug"
    ) return;
    const frameId = window.requestAnimationFrame(() => {
      const element = editorRef.current;
      if (!element) return;
      const nextWidth =
        resizeMode === "auto-width"
          ? Math.max(1, Math.ceil(element.scrollWidth))
          : node.transform.width;
      const nextHeight = Math.max(1, Math.ceil(element.scrollHeight));
      if (
        Math.abs(nextWidth - node.transform.width) < 0.5 &&
        Math.abs(nextHeight - node.transform.height) < 0.5
      ) {
        return;
      }
      const transform = { ...node.transform, width: nextWidth, height: nextHeight };
      if (responsive.hasOverrides(node)) {
        dispatchCommand(
          createFieldUpdateCommand(
            node.id,
            "layout",
            node.layout,
            responsive.updateLayout(node, responsive.getActiveBreakpoint(), {
              transform,
              manualTransform: true,
            }),
          ),
        );
      } else {
        dispatchCommand(createFieldUpdateCommand(node.id, "transform", node.transform, transform));
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    commandGraph,
    dispatchCommand,
    isEditing,
    node,
    responsive,
    resizeMode,
    text,
    transformActive,
  ]);

  const enterEditing = (event: ReactMouseEvent<HTMLElement>) => {
    if (!canEditContent || !commandGraph || !commandManager || !selection) return;
    event.preventDefault();
    event.stopPropagation();
    selection.select([node.id]);
    selection.setEditing(node.id);
    setDraftText(text);
    setIsEditing(true);
  };

  const finishEditing = () => {
    const nextText = editorRef.current?.innerText ?? draftText;
    setIsEditing(false);
    selection?.setEditing(null);
    if (skipNextCommitRef.current) {
      skipNextCommitRef.current = false;
      return;
    }
    if (!commandGraph || nextText === text) return;
    const before = commandGraph.serializeTree();
    if (layoutEngine?.hasGenericLayout(before)) {
      const sourceNode = before.nodes[node.id];
      if (!sourceNode) return;
      let after = structuredClone(before);
      if (responsive.hasOverrides(sourceNode)) {
        after.nodes[node.id].layout = responsive.updateLayout(
          sourceNode,
          responsive.getActiveBreakpoint(),
          { props: { text: nextText } },
        );
      } else {
        after.nodes[node.id].props = { ...sourceNode.props, text: nextText };
      }
      after = structuredLayout?.isStructuredScene(after)
        ? structuredLayout.reflowScene(after)
        : layoutEngine.reflowScene(after);
      dispatchCommand(createSceneReplaceCommand(before, after, `Edit ${sourceNode.name}`));
      return;
    }
    if (responsive.hasOverrides(node)) {
      const nextLayout = responsive.updateLayout(node, responsive.getActiveBreakpoint(), {
        props: { text: nextText },
      });
      dispatchCommand(createFieldUpdateCommand(node.id, "layout", node.layout, nextLayout));
    } else {
      dispatchCommand(createFieldUpdateCommand(node.id, "props", node.props, { ...node.props, text: nextText }));
    }
  };

  const cancelEditing = () => {
    skipNextCommitRef.current = true;
    if (editorRef.current) editorRef.current.innerText = text;
    setDraftText(text);
    setIsEditing(false);
    selection?.setEditing(null);
  };

  const requestedTag = String(node.props.semanticTag ?? "div").toLowerCase();
  const SemanticElement = (
    ["h1", "h2", "h3", "h4", "p", "span"].includes(requestedTag) ? requestedTag : "div"
  ) as "div" | "h1" | "h2" | "h3" | "h4" | "p" | "span";

  return (
    <SemanticElement
      id={getNodeDomId(node)}
      ref={(element) => { editorRef.current = element; }}
      data-node-id={node.id}
      data-node-type={node.type}
      data-theme-chrome-slot={themeChromeNodeSlot(node) ?? undefined}
      data-node-editing={isEditing ? "true" : undefined}
      contentEditable={isEditing}
      suppressContentEditableWarning
      role={isEditing ? "textbox" : undefined}
      tabIndex={isEditing ? 0 : undefined}
      onDoubleClick={enterEditing}
      onPointerDown={(event) => {
        if (isEditing) event.stopPropagation();
      }}
      onBlur={finishEditing}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancelEditing();
        }
      }}
      style={{
        ...getNodeFrameStyle(node),
        ...(resizeMode === "auto-width"
          ? { width: "max-content", height: "max-content", whiteSpace: "pre" }
          : resizeMode === "auto-height"
            ? { height: "auto", minHeight: 1 }
            : {}),
        color:
          textFillOpacity >= 100
            ? textColor
            : `color-mix(in srgb, ${textColor} ${textFillOpacity}%, transparent)`,
        fontFamily: String(node.props.fontFamily ?? "Inter, system-ui, sans-serif"),
        fontSize: Number(node.props.fontSize ?? 16),
        fontWeight: node.props.fontWeight as CSSProperties["fontWeight"] ?? 400,
        fontStyle: node.props.fontStyle === "italic" ? "italic" : "normal",
        lineHeight: node.props.lineHeight === "normal" ? "normal" : Number(node.props.lineHeight ?? 1.35),
        textAlign: String(node.props.textAlign ?? "left") as CSSProperties["textAlign"],
        letterSpacing: Number(node.props.letterSpacing ?? 0),
        textTransform: String(node.props.textTransform ?? "none") as CSSProperties["textTransform"],
        textDecoration: String(node.props.textDecoration ?? "none"),
        fontFeatureSettings: String(node.props.fontFeatureSettings ?? "normal"),
        direction: String(node.props.direction ?? "ltr") as CSSProperties["direction"],
        writingMode: String(node.props.writingMode ?? "horizontal-tb") as CSSProperties["writingMode"],
        alignContent:
          node.props.verticalAlign === "middle"
            ? "center"
            : node.props.verticalAlign === "bottom"
              ? "end"
              : "start",
        whiteSpace:
          resizeMode === "auto-width" || node.props.whiteSpace === "nowrap"
            ? "pre"
            : "pre-wrap",
        overflow: resizeMode === "fixed" ? "hidden" : "visible",
        cursor: "text",
        userSelect: isEditing ? "text" : "none",
        outline: "none",
      }}
    >
      {isEditing ? draftText : text}
    </SemanticElement>
  );
});

TextRenderer.displayName = "TextRenderer";
