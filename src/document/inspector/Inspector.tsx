import { useMemo } from "react";
import { useStore } from "zustand";
import { useOptionalEditorStores } from "@/engine/kernel";
import { useInspectorStore } from "@/stores/inspector.store";
import { propertyEngine } from "@/document/properties";
import { propertyRegistry, type PropertySchema } from "@/document/properties/registry";
import { NumberPropertyEditor, SelectPropertyEditor, TextPropertyEditor } from "./editors";

const renderEditor = (schema: PropertySchema, selectedIds: string[], value: unknown, mixed: boolean) => {
  const commit = (next: unknown) => propertyEngine.write(selectedIds, schema.key, next);
  if (schema.editor === "number" || schema.editor === "slider") {
    return (
      <NumberPropertyEditor
        key={schema.key}
        label={schema.label ?? schema.key}
        value={typeof value === "number" ? value : undefined}
        mixed={mixed}
        onCommit={commit}
      />
    );
  }
  if (schema.editor === "select") {
    return (
      <SelectPropertyEditor
        key={schema.key}
        label={schema.label ?? schema.key}
        value={typeof value === "string" ? value : undefined}
        mixed={mixed}
        options={(schema.options as Array<{ label: string; value: string }> | undefined) ?? []}
        onCommit={commit}
      />
    );
  }
  return (
    <TextPropertyEditor
      key={schema.key}
      label={schema.label ?? schema.key}
      value={typeof value === "string" ? value : undefined}
      mixed={mixed}
      onCommit={commit}
    />
  );
};

export const Inspector = () => {
  const stores = useOptionalEditorStores();
  const selectedIds = useStore(stores.selection, (state) => state.selectedIds);
  const activeId = useStore(stores.selection, (state) => state.activeId);
  const activeNode = useStore(stores.scene, (state) => (activeId ? state.nodes[activeId] : undefined));
  const expandedGroups = useInspectorStore((state) => state.expandedGroups);
  const toggleGroup = useInspectorStore((state) => state.toggleGroup);

  const grouped = useMemo(() => {
    if (!activeNode) return [];
    const schemas = propertyRegistry.getSchemasFor(activeNode.type, activeNode);
    const groups = new Map<string, PropertySchema[]>();
    schemas.forEach((schema) => groups.set(schema.group, [...(groups.get(schema.group) ?? []), schema]));
    return Array.from(groups.entries());
  }, [activeNode]);

  if (!activeNode || selectedIds.length === 0) {
    return <aside className="border-l border-border p-3 text-xs text-muted-foreground">Select an element to edit properties.</aside>;
  }

  return (
    <aside className="border-l border-border bg-background p-3">
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Inspector</div>
        <div className="truncate text-sm font-semibold">
          {selectedIds.length > 1 ? `${selectedIds.length} selected` : activeNode.name}
        </div>
      </div>
      <div className="space-y-2">
        {grouped.map(([group, schemas]) => {
          const open = expandedGroups.includes(group);
          return (
            <section key={group} className="rounded-md border border-border">
              <button className="flex w-full items-center justify-between px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide" onClick={() => toggleGroup(group)}>
                {group}
                <span>{open ? "−" : "+"}</span>
              </button>
              {open && (
                <div className="space-y-2 border-t border-border p-2">
                  {schemas.map((schema) => {
                    const mixed = propertyEngine.readMixed(selectedIds, schema.key);
                    return renderEditor(schema, selectedIds, mixed.value, mixed.mixed);
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
};
