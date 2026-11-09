import { Boxes, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ComponentDefinition } from "@/types";

export type ComponentLibraryPanelProps = {
  definitions: readonly ComponentDefinition[];
  onInsert: (definitionId: string) => void;
};

export const ComponentLibraryPanel = ({
  definitions,
  onInsert,
}: ComponentLibraryPanelProps) => (
  <section className="space-y-2 border-b border-[#444] pb-3" aria-label="Components">
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-[#9a9a9a]">
        <Boxes className="h-3.5 w-3.5" />
        Components
      </div>
      <span className="text-[9px] text-[#858585]">{definitions.length}</span>
    </div>
    {definitions.length ? (
      <div className="space-y-1.5" data-component-library>
        {definitions.map((definition) => (
          <div
            key={definition.id}
            className="flex min-h-11 items-center gap-2 rounded border border-[#444] bg-[#242424] px-2 py-1.5"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold text-white">{definition.name}</div>
              <div className="mt-0.5 text-[9px] text-[#999]">
                {Object.keys(definition.variants).length} variant{Object.keys(definition.variants).length === 1 ? "" : "s"}
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Insert ${definition.name}`}
              className="h-7 shrink-0 px-2 text-[10px] text-[#0d99ff] hover:bg-white/10 hover:text-[#42afff]"
              onClick={() => onInsert(definition.id)}
            >
              <Plus className="mr-1 h-3 w-3" />
              Insert
            </Button>
          </div>
        ))}
      </div>
    ) : (
      <div className="rounded border border-dashed border-[#444] px-2 py-3 text-center text-[10px] text-[#888]">
        No components
      </div>
    )}
  </section>
);
