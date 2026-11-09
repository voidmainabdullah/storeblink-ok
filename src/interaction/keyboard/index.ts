export type ShortcutHandlerContext = {
  undo: () => void;
  redo: () => void;
  copy: () => void;
  cut: () => void;
  paste: () => void;
  duplicate: () => void;
  deleteSelection: () => void;
  clearSelection: () => void;
  nudge: (delta: { x: number; y: number }) => void;
};

export type ShortcutAction =
  | "undo"
  | "redo"
  | "copy"
  | "cut"
  | "paste"
  | "duplicate"
  | "delete"
  | "escape"
  | "nudge-left"
  | "nudge-right"
  | "nudge-up"
  | "nudge-down";

export const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

export const isCanvasFocusActive = (activeElement: Element | null = document.activeElement): boolean =>
  Boolean(activeElement?.closest("[data-editor-canvas-shell], [data-editor-structure-tree]"));

export const canDeleteCanvasSelection = (
  eventTarget: EventTarget | null,
  editingNodeId: string | null,
  activeElement: Element | null = document.activeElement,
): boolean =>
  !editingNodeId &&
  !isTypingTarget(eventTarget) &&
  isCanvasFocusActive(activeElement);

export const getShortcutAction = (event: KeyboardEvent): ShortcutAction | null => {
  const key = event.key.toLowerCase();
  const mod = event.metaKey || event.ctrlKey;
  if (mod && key === "z") return event.shiftKey ? "redo" : "undo";
  if (mod && key === "y") return "redo";
  if (mod && key === "c") return "copy";
  if (mod && key === "x") return "cut";
  if (mod && key === "v") return "paste";
  if (mod && key === "d") return "duplicate";
  if (key === "delete" || key === "backspace") return "delete";
  if (key === "escape") return "escape";
  if (key === "arrowleft") return "nudge-left";
  if (key === "arrowright") return "nudge-right";
  if (key === "arrowup") return "nudge-up";
  if (key === "arrowdown") return "nudge-down";
  return null;
};

export const handleShortcut = (event: KeyboardEvent, ctx: ShortcutHandlerContext): boolean => {
  if (isTypingTarget(event.target)) return false;
  const action = getShortcutAction(event);
  if (!action) return false;
  event.preventDefault();
  const step = event.shiftKey ? 10 : 1;
  if (action === "undo") ctx.undo();
  else if (action === "redo") ctx.redo();
  else if (action === "copy") ctx.copy();
  else if (action === "cut") ctx.cut();
  else if (action === "paste") ctx.paste();
  else if (action === "duplicate") ctx.duplicate();
  else if (action === "delete") ctx.deleteSelection();
  else if (action === "escape") ctx.clearSelection();
  else if (action === "nudge-left") ctx.nudge({ x: -step, y: 0 });
  else if (action === "nudge-right") ctx.nudge({ x: step, y: 0 });
  else if (action === "nudge-up") ctx.nudge({ x: 0, y: -step });
  else if (action === "nudge-down") ctx.nudge({ x: 0, y: step });
  return true;
};
