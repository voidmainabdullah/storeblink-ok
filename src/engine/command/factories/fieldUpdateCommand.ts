import type { Command } from "@/engine/command/types";
import type { NodeId } from "@/types";
import type { SceneNodePatch } from "@/engine/scene-graph";

export type FieldUpdateCommandPayload = {
  field: string;
  changes: Array<{ nodeId: NodeId; before: unknown; after: unknown }>;
};

const patchForField = (field: string, value: unknown): SceneNodePatch => {
  if (field === "name" || field === "meta.name") return { name: String(value) };
  if (field === "props") return { props: value as SceneNodePatch["props"] };
  if (field === "style") return { style: value as SceneNodePatch["style"] };
  if (field === "layout") return { layout: value as SceneNodePatch["layout"] };
  if (field === "transform") return { transform: value as SceneNodePatch["transform"] };
  if (field === "meta") return { meta: value as SceneNodePatch["meta"] };
  if (field === "extensions") return { extensions: value as SceneNodePatch["extensions"] };
  if (field.startsWith("meta.")) return { meta: { [field.slice("meta.".length)]: value } as SceneNodePatch["meta"] };
  if (field.startsWith("props.")) return { props: { [field.slice("props.".length)]: value } };
  if (field.startsWith("style.")) return { style: { [field.slice("style.".length)]: value } as SceneNodePatch["style"] };
  if (field.startsWith("layout.")) return { layout: { [field.slice("layout.".length)]: value } as SceneNodePatch["layout"] };
  if (field.startsWith("transform.")) return { transform: { [field.slice("transform.".length)]: value } as SceneNodePatch["transform"] };
  return { extensions: { [field]: value } };
};

export const createFieldUpdateCommand = (
  fieldOrNodeId: string,
  changesOrField: Array<{ nodeId: NodeId; before: unknown; after: unknown }> | string,
  before?: unknown,
  after?: unknown,
): Command<FieldUpdateCommandPayload> => {
  const field = Array.isArray(changesOrField) ? fieldOrNodeId : changesOrField;
  const changes = Array.isArray(changesOrField)
    ? changesOrField
    : [{ nodeId: fieldOrNodeId, before, after }];
  const timestamp = Date.now();
  return {
    id: `field-update-${timestamp}-${Math.random().toString(36).slice(2)}`,
    type: "node:field-update",
    label: `Update ${field}${changes.length > 1 ? ` on ${changes.length} nodes` : ""}`,
    timestamp,
    payload: { field, changes },
    execute: (ctx) => {
      changes.forEach((change) => ctx.sceneGraph.updateNode(change.nodeId, patchForField(field, change.after)));
    },
    undo: (ctx) => {
      changes.forEach((change) => ctx.sceneGraph.updateNode(change.nodeId, patchForField(field, change.before)));
    },
    merge: (next) => {
      if (next.type !== "node:field-update" || next.timestamp - timestamp > 500) return null;
      const nextPayload = next.payload as FieldUpdateCommandPayload;
      if (nextPayload.field !== field || nextPayload.changes.length !== changes.length) return null;
      const ids = changes.map((change) => change.nodeId).join(",");
      const nextIds = nextPayload.changes.map((change) => change.nodeId).join(",");
      if (ids !== nextIds) return null;
      return createFieldUpdateCommand(
        field,
        changes.map((change, index) => ({
          nodeId: change.nodeId,
          before: change.before,
          after: nextPayload.changes[index].after,
        })),
      );
    },
  };
};
