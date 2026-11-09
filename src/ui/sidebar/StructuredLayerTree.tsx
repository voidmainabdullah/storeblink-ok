import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, ChevronUp, Copy, Eye, EyeOff, GripVertical, Trash2 } from "lucide-react";
import { EDITOR_SYSTEM_KEYS, useEngineContext } from "@/engine/kernel";
import type { ResponsiveSystem } from "@/layout/responsive";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { NodeId, SceneNode } from "@/types";

type LayerRowProps = {
  node: SceneNode;
  selected: boolean;
  activeBreakpoint: ResponsiveBreakpoint;
  onSelect: (node: SceneNode) => void;
  onMove: (node: SceneNode, direction: "up" | "down") => void;
  onToggleHidden: (node: SceneNode, hidden: boolean) => void;
  onDuplicate: (node: SceneNode) => void;
  onDelete: (node: SceneNode) => void;
  expanded: boolean;
  hasChildren: boolean;
  onToggleExpanded: (node: SceneNode) => void;
  onRename: (node: SceneNode, name: string) => void;
  onHover: (node: SceneNode | null) => void;
  structureEditingEnabled: boolean;
};

const LayerRow = ({
  node,
  selected,
  activeBreakpoint,
  onSelect,
  onMove,
  onToggleHidden,
  onDuplicate,
  onDelete,
  expanded,
  hasChildren,
  onToggleExpanded,
  onRename,
  onHover,
  structureEditingEnabled,
}: LayerRowProps) => {
  const engine = useEngineContext();
  const responsive = engine.resolveSystem<ResponsiveSystem>(EDITOR_SYSTEM_KEYS.responsive);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(node.name);
  useEffect(() => {
    if (!editingName) setDraftName(node.name);
  }, [editingName, node.name]);
  const depth = Number(node.extensions?.layerDepth ?? 0);
  const editorKind = String(node.extensions?.editorKind ?? node.type);
  const structuredItem = editorKind === "section" || editorKind === "block";
  const fixed = editorKind === "page";
  const resolved = responsive.resolveNode(node, activeBreakpoint);
  const sortable = useSortable({
    id: node.id,
    disabled: !structureEditingEnabled || !structuredItem || fixed,
  });
  const style = {
    paddingLeft: 4 + depth * 14,
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.55 : 1,
    zIndex: sortable.isDragging ? 30 : undefined,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={`group flex min-h-8 items-center rounded transition-colors ${
        selected ? "bg-[#0178ff] text-white" : "text-[#ededed] hover:bg-white/10"
      }`}
      data-structured-layer-id={node.id}
      onPointerEnter={() => onHover(node)}
      onPointerLeave={() => onHover(null)}
    >
      <button
        type="button"
        title={!structureEditingEnabled || fixed ? "Layer order is locked in Fixed mode" : "Drag to reorder"}
        className={`grid h-7 w-5 shrink-0 place-items-center ${!structureEditingEnabled || fixed ? "cursor-default opacity-25" : "cursor-grab opacity-55 hover:opacity-100 active:cursor-grabbing"}`}
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVertical size={12} />
      </button>
      <button
        type="button"
        aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
        disabled={!hasChildren}
        onClick={() => onToggleExpanded(node)}
        className={`grid h-7 w-5 shrink-0 place-items-center rounded hover:bg-white/10 ${hasChildren ? "opacity-80" : "opacity-0"}`}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {editingName ? (
        <input
          autoFocus
          value={draftName}
          aria-label={`Rename ${node.name}`}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={() => {
            const nextName = draftName.trim();
            if (nextName && nextName !== node.name) onRename(node, nextName);
            else setDraftName(node.name);
            setEditingName(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraftName(node.name);
              setEditingName(false);
            }
          }}
          className="mr-1 h-6 min-w-0 flex-1 rounded border border-[#0178ff] bg-[#202020] px-1.5 text-[11px] text-white outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => onSelect(node)}
          onDoubleClick={() => {
            if (!structureEditingEnabled) return;
            setDraftName(node.name);
            setEditingName(true);
          }}
          className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-[12px]"
        >
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {node.extensions?.dynamicSource ? <span className="h-1.5 w-1.5 rounded-full bg-[#65d6a5]" title="Live data" /> : null}
          {resolved.meta.hidden ? <EyeOff size={11} className="shrink-0 opacity-70" /> : null}
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] uppercase text-[#d8d8d8]">{editorKind}</span>
        </button>
      )}
      {structuredItem && structureEditingEnabled ? (
        <div className={`mr-1 flex shrink-0 items-center ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>
          <button type="button" title="Move up" className="grid h-6 w-6 place-items-center rounded hover:bg-white/15" onClick={() => onMove(node, "up")}><ChevronUp size={12} /></button>
          <button type="button" title="Move down" className="grid h-6 w-6 place-items-center rounded hover:bg-white/15" onClick={() => onMove(node, "down")}><ChevronDown size={12} /></button>
          <button type="button" title={resolved.meta.hidden ? "Show on this device" : "Hide on this device"} className="grid h-6 w-6 place-items-center rounded hover:bg-white/15" onClick={() => onToggleHidden(node, !resolved.meta.hidden)}>
            {resolved.meta.hidden ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
          <button type="button" title="Duplicate" className="grid h-6 w-6 place-items-center rounded hover:bg-white/15" onClick={() => onDuplicate(node)}><Copy size={12} /></button>
          <button type="button" title="Delete" className="grid h-6 w-6 place-items-center rounded text-red-300 hover:bg-red-500/20" onClick={() => onDelete(node)}><Trash2 size={12} /></button>
        </div>
      ) : null}
    </div>
  );
};

export type StructuredLayerTreeProps = {
  layers: SceneNode[];
  selectedIds: NodeId[];
  activeBreakpoint: ResponsiveBreakpoint;
  onSelect: (node: SceneNode) => void;
  onMove: (node: SceneNode, direction: "up" | "down") => void;
  onToggleHidden: (node: SceneNode, hidden: boolean) => void;
  onDuplicate: (node: SceneNode) => void;
  onDelete: (node: SceneNode) => void;
  onReorder: (activeNodeId: NodeId, overNodeId: NodeId) => void;
  onRename: (node: SceneNode, name: string) => void;
  onHover: (node: SceneNode | null) => void;
  structureEditingEnabled?: boolean;
};

export const StructuredLayerTree = ({
  layers,
  selectedIds,
  activeBreakpoint,
  onSelect,
  onMove,
  onToggleHidden,
  onDuplicate,
  onDelete,
  onReorder,
  onRename,
  onHover,
  structureEditingEnabled = true,
}: StructuredLayerTreeProps) => {
  const [collapsedIds, setCollapsedIds] = useState<Set<NodeId>>(() => new Set());
  const layerById = useMemo(() => new Map(layers.map((node) => [node.id, node])), [layers]);
  const parentIds = useMemo(
    () => new Set(layers.map((node) => node.parentId).filter((id): id is NodeId => Boolean(id))),
    [layers],
  );
  useEffect(() => {
    if (!selectedIds.length) return;
    setCollapsedIds((current) => {
      const next = new Set(current);
      selectedIds.forEach((selectedId) => {
        let parentId = layerById.get(selectedId)?.parentId ?? null;
        while (parentId) {
          next.delete(parentId);
          parentId = layerById.get(parentId)?.parentId ?? null;
        }
      });
      return next;
    });
  }, [layerById, selectedIds]);
  const visibleLayers = useMemo(
    () =>
      layers.filter((node) => {
        let parentId = node.parentId;
        while (parentId) {
          if (collapsedIds.has(parentId)) return false;
          parentId = layerById.get(parentId)?.parentId ?? null;
        }
        return true;
      }),
    [collapsedIds, layerById, layers],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dragEnd = (event: DragEndEvent) => {
    if (!structureEditingEnabled) return;
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (overId && activeId !== overId) onReorder(activeId, overId);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
      <SortableContext items={visibleLayers.map((node) => node.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5">
          {visibleLayers.map((node) => (
            <LayerRow
              key={node.id}
              node={node}
              selected={selectedIds.includes(node.id)}
              activeBreakpoint={activeBreakpoint}
              onSelect={onSelect}
              onMove={onMove}
              onToggleHidden={onToggleHidden}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              expanded={!collapsedIds.has(node.id)}
              hasChildren={parentIds.has(node.id)}
              onToggleExpanded={(target) =>
                setCollapsedIds((current) => {
                  const next = new Set(current);
                  if (next.has(target.id)) next.delete(target.id);
                  else next.add(target.id);
                  return next;
                })
              }
              onRename={onRename}
              onHover={onHover}
              structureEditingEnabled={structureEditingEnabled}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
