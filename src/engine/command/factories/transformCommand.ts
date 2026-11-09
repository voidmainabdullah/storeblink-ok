import type { TransformCommandChange, TransformCommandPayload, TransformKind, Command } from "../types";

const createCommandId = (kind: TransformKind) =>
  `transform-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const createTransformCommand = (
  kind: TransformKind,
  changes: TransformCommandChange[],
): Command<TransformCommandPayload> => {
  const timestamp = Date.now();
  return {
    id: createCommandId(kind),
    type: `transform:${kind}`,
    label: `${kind.charAt(0).toUpperCase() + kind.slice(1)} ${changes.length === 1 ? "node" : `${changes.length} nodes`}`,
    timestamp,
    payload: { kind, changes },
    execute: (ctx) => {
      changes.forEach((change) => {
        if (change.layoutAfter) {
          ctx.sceneGraph.updateNode(change.nodeId, { layout: change.layoutAfter });
          return;
        }
        ctx.sceneGraph.updateNode(change.nodeId, {
          transform: change.after,
          ...(change.propsAfter ? { props: change.propsAfter } : {}),
        });
      });
    },
    undo: (ctx) => {
      changes.forEach((change) => {
        if (change.layoutBefore) {
          ctx.sceneGraph.updateNode(change.nodeId, { layout: change.layoutBefore });
          return;
        }
        ctx.sceneGraph.updateNode(change.nodeId, {
          transform: change.before,
          ...(change.propsBefore ? { props: change.propsBefore } : {}),
        });
      });
    },
    merge: (next) => {
      if (next.type !== `transform:${kind}`) return null;
      const nextPayload = next.payload as TransformCommandPayload;
      if (nextPayload.kind !== kind) return null;
      if (next.timestamp - timestamp > 500) return null;
      const ids = changes.map((change) => change.nodeId).join(",");
      const nextIds = nextPayload.changes.map((change) => change.nodeId).join(",");
      if (ids !== nextIds) return null;
      return createTransformCommand(
        kind,
        changes.map((change, index) => ({
          nodeId: change.nodeId,
          before: change.before,
          after: nextPayload.changes[index].after,
          propsBefore: change.propsBefore,
          propsAfter: nextPayload.changes[index].propsAfter ?? change.propsAfter,
          layoutBefore: change.layoutBefore,
          layoutAfter: nextPayload.changes[index].layoutAfter ?? change.layoutAfter,
        })),
      );
    },
  };
};
