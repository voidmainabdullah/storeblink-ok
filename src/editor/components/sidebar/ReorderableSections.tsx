import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SECTION_LABELS, type SectionKey } from "@/lib/storeTheme";

// ============= Drag-to-reorder section list =============
export const ReorderableSections = ({
  order, sections, onReorder, onToggle, compact = false, activeSection, onSelect,
}: {
  order: SectionKey[];
  sections: Record<SectionKey, boolean>;
  onReorder: (next: SectionKey[]) => void;
  onToggle: (k: SectionKey) => void;
  compact?: boolean;
  activeSection?: SectionKey | null;
  onSelect?: (k: SectionKey) => void;
}) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = order.indexOf(active.id as SectionKey);
    const newIdx = order.indexOf(over.id as SectionKey);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(order, oldIdx, newIdx));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {order.map((k) => (
            <SortableRow
              key={k}
              k={k}
              on={sections[k]}
              compact={compact}
              selected={activeSection === k}
              onSelect={onSelect ? () => onSelect(k) : undefined}
              onToggle={() => onToggle(k)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

const SortableRow = ({
  k, on, onToggle, compact = false, selected = false, onSelect,
}: {
  k: SectionKey;
  on: boolean;
  onToggle: () => void;
  compact?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: k });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}
      className={`flex items-center justify-between rounded-lg border bg-background hover:bg-muted/40 ${compact ? "p-1.5" : "p-2.5"} ${selected ? "border-foreground/40 bg-muted/60" : "border-border"}`}>
      <div className="flex items-center gap-2 min-w-0">
        <button {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
          <GripVertical size={compact ? 12 : 14} />
        </button>
        {on ? <Eye size={13} className="text-emerald-600" /> : <EyeOff size={13} className="text-muted-foreground" />}
        <button onClick={onSelect} className={`${compact ? "text-[11px]" : "text-sm"} font-medium truncate text-left`}>
          {SECTION_LABELS[k]}
        </button>
      </div>
      <Switch checked={on} onCheckedChange={onToggle} />
    </div>
  );
};

export const SectionToggleRow = ({ k, on, onToggle }: { k: SectionKey; on: boolean; onToggle: () => void; draggable: boolean }) => (
  <div className="flex items-center justify-between rounded-lg border border-border p-2.5 bg-background">
    <div className="flex items-center gap-2 min-w-0">
      {on ? <Eye size={13} className="text-emerald-600" /> : <EyeOff size={13} className="text-muted-foreground" />}
      <span className="text-sm font-medium truncate">{SECTION_LABELS[k]}</span>
    </div>
    <Switch checked={on} onCheckedChange={onToggle} />
  </div>
);

