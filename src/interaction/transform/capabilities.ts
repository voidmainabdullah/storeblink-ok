import type { SceneNode } from "@/types";

export const canTransformNode = (
  node: SceneNode | null | undefined,
): node is SceneNode =>
  Boolean(
    node &&
      !node.meta.locked &&
      node.extensions?.transformable !== false &&
      node.extensions?.autoPositioned !== true,
  );

export const shouldPreserveAspectRatio = (
  node: SceneNode | null | undefined,
): boolean =>
  Boolean(
    node &&
      (
        node.extensions?.aspectRatioRequired === true ||
        node.extensions?.aspectRatioLocked === true
      ),
  );
