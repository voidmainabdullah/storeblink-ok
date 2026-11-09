import { getAABB, rectsIntersect } from "@/rendering/geometry";
import type { Rect, SceneNode } from "@/types";

export { rectsIntersect } from "@/rendering/geometry";

export const shouldRenderNode = (node: SceneNode, visibleRegion: Rect): boolean => {
  if (node.meta.hidden) return false;
  if (node.parentId === null) return true;
  return rectsIntersect(getAABB(node), visibleRegion);
};
