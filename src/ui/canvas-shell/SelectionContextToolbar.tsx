import { useLayoutEffect, useState, type PointerEvent, type RefObject } from "react";
import { ChevronDown, ChevronUp, Copy, CornerUpLeft, Eye, EyeOff, Trash2 } from "lucide-react";
import { useStore } from "zustand";
import { useEditorStores } from "@/engine/kernel/useEditorStores";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { SceneNode } from "@/types";

export type SelectionContextToolbarProps = {
  containerRef: RefObject<HTMLElement>;
  node: SceneNode | null;
  parent: SceneNode | null;
  sceneRevision: number;
  activeBreakpoint: ResponsiveBreakpoint;
  hidden: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
  onSelectParent: (parent: SceneNode) => void;
  structureEditingEnabled?: boolean;
};

const toolbarButton =
  "grid h-8 w-8 place-items-center rounded text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0178ff]";

export const SelectionContextToolbar = ({
  containerRef,
  node,
  parent,
  sceneRevision,
  activeBreakpoint,
  hidden,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onToggleHidden,
  onDelete,
  onSelectParent,
  structureEditingEnabled = true,
}: SelectionContextToolbarProps) => {
  const stores = useEditorStores();
  const pan = useStore(stores.viewport, (state) => state.pan);
  const zoom = useStore(stores.viewport, (state) => state.zoom);
  const viewportSize = useStore(stores.viewport, (state) => state.viewportSize);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!node || hidden) {
      setPosition(null);
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      const selectorId =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(node.id)
          : node.id.replace(/["\\]/g, "\\$&");
      const element = container?.querySelector<HTMLElement>(`[data-node-id="${selectorId}"]`);
      if (!container || !element) {
        setPosition(null);
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const toolbarWidth = parent ? 246 : 210;
      const left = Math.min(
        Math.max(8, elementRect.left - containerRect.left),
        Math.max(8, containerRect.width - toolbarWidth - 8),
      );
      const above = elementRect.top - containerRect.top - 40;
      const top =
        above >= 8
          ? above
          : Math.min(containerRect.height - 44, elementRect.bottom - containerRect.top + 8);
      setPosition({ left, top: Math.max(8, top) });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    activeBreakpoint,
    containerRef,
    hidden,
    node,
    parent,
    pan.x,
    pan.y,
    sceneRevision,
    viewportSize.height,
    viewportSize.width,
    zoom,
  ]);

  if (!structureEditingEnabled || !node || !position) return null;
  const stopGesture = (event: PointerEvent<HTMLDivElement>) => event.stopPropagation();

  return (
    <div
      role="toolbar"
      aria-label={`${node.name} actions`}
      data-editor-selection-toolbar
      onPointerDown={stopGesture}
      style={{ left: position.left, top: position.top }}
      className="absolute z-30 flex h-9 items-center gap-0.5 rounded-md border border-white/10 bg-[#242424] px-1 shadow-xl"
    >
      <button type="button" title="Move up" aria-label="Move up" className={toolbarButton} onClick={onMoveUp}>
        <ChevronUp size={14} />
      </button>
      <button type="button" title="Move down" aria-label="Move down" className={toolbarButton} onClick={onMoveDown}>
        <ChevronDown size={14} />
      </button>
      <button type="button" title="Duplicate" aria-label="Duplicate" className={toolbarButton} onClick={onDuplicate}>
        <Copy size={14} />
      </button>
      <button
        type="button"
        title={hidden ? "Show on this device" : "Hide on this device"}
        aria-label={hidden ? "Show on this device" : "Hide on this device"}
        className={toolbarButton}
        onClick={onToggleHidden}
      >
        {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      {parent?.extensions?.editorKind === "section" ? (
        <button
          type="button"
          title="Select parent section"
          aria-label="Select parent section"
          className={toolbarButton}
          onClick={() => onSelectParent(parent)}
        >
          <CornerUpLeft size={14} />
        </button>
      ) : null}
      <button type="button" title="Delete" aria-label="Delete" className={`${toolbarButton} text-red-300`} onClick={onDelete}>
        <Trash2 size={14} />
      </button>
    </div>
  );
};
