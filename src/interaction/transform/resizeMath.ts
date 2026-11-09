import type { MoveableEvents } from "react-moveable";
import type { TransformData } from "@/types";

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const finitePair = (value: readonly number[] | undefined): readonly [number, number] => [
  finiteNumber(value?.[0], 0),
  finiteNumber(value?.[1], 0),
];

const normalizeRotation = (rotation: number): number => {
  const normalized = finiteNumber(rotation, 0) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const isAxisAligned = (rotation: number): boolean => {
  const normalized = normalizeRotation(rotation);
  return Math.min(normalized, Math.abs(normalized - 360)) < 0.0001;
};

const getResizeDirection = (event: MoveableEvents["resize"]): readonly [number, number] => {
  const [rawX, rawY] = finitePair(event.direction);
  return [Math.sign(rawX), Math.sign(rawY)];
};

/**
 * Moveable drag distances are already expressed in the target/container
 * coordinate system. The Moveable `zoom` prop scales its controls; resize
 * translation must not be divided by viewport zoom again.
 */
export const getMoveableDistance = (distance: readonly number[] | undefined) => {
  const [x, y] = finitePair(distance);
  return { x, y };
};

/** Converts screen-space pointer distance to document space for canvas drag. */
export const getDocumentDistance = (distance: readonly number[] | undefined, zoom: number) => {
  const point = getMoveableDistance(distance);
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return { x: point.x / safeZoom, y: point.y / safeZoom };
};

/**
 * The nested resize drag is the authoritative translation for transformed
 * targets. `beforeTranslate` is start-relative. `beforeDist` is deliberately
 * excluded because it is a pre-transform distance and can diverge after
 * rotation or other transforms.
 */
export const getResizeTranslation = (event: MoveableEvents["resize"]) =>
  getMoveableDistance(event.drag?.beforeTranslate ?? event.drag?.dist);

/**
 * Computes the new axis-aligned top-left from the immutable gesture snapshot.
 *
 * For a non-rotated target this is more stable than trusting tiny/noisy nested
 * drag translations: east/south handles can never move x/y, while west/north
 * handles move by exactly the size delta required to keep the opposite edge
 * fixed. This also makes the invariants explicit and testable.
 *
 * Rotated targets use Moveable's start-relative `beforeTranslate`, because the
 * required world-space translation depends on the transformed fixed point.
 */
const getResizePosition = (
  initial: TransformData,
  event: MoveableEvents["resize"],
  width: number,
  height: number,
) => {
  if (!isAxisAligned(initial.rotation)) {
    const translation = getResizeTranslation(event);
    return {
      x: initial.x + translation.x,
      y: initial.y + translation.y,
    };
  }

  const [directionX, directionY] = getResizeDirection(event);
  return {
    x: directionX < 0 ? initial.x + (initial.width - width) : initial.x,
    y: directionY < 0 ? initial.y + (initial.height - height) : initial.y,
  };
};

/**
 * Pure, immutable-start resize math.
 *
 * `initial` must be captured exactly once in `beginTransform()`. Every event is
 * resolved independently from that snapshot. Preview state must never become
 * the base of a later frame.
 */
export const getResizeTransformPatch = (
  initial: TransformData | undefined,
  event: MoveableEvents["resize"],
): Partial<TransformData> => {
  if (!initial) return {};

  const width = Math.max(1, finiteNumber(event.width, initial.width));
  const height = Math.max(1, finiteNumber(event.height, initial.height));
  const position = getResizePosition(initial, event, width, height);

  return {
    x: finiteNumber(position.x, initial.x),
    y: finiteNumber(position.y, initial.y),
    width,
    height,
  };
};
