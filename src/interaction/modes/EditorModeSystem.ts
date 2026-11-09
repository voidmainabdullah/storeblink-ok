import type { SceneNode } from "@/types";

export type EditorMode = "fixed" | "independent";

export type EditorCapability =
  | "select"
  | "edit-content"
  | "replace-image"
  | "replace-logo"
  | "brand"
  | "transform"
  | "style"
  | "structure"
  | "theme"
  | "viewport"
  | "template"
  | "save-publish";

export interface EditorModeSystemAPI {
  getSnapshot(): EditorMode;
  subscribe(listener: () => void): () => void;
  setMode(mode: EditorMode): void;
  can(capability: EditorCapability, node?: SceneNode | null): boolean;
  filterContentPatch(
    node: SceneNode,
    patch: Record<string, unknown>,
  ): Record<string, unknown>;
}

const FIXED_ALWAYS_ALLOWED = new Set<EditorCapability>([
  "select",
  "replace-logo",
  "brand",
  "viewport",
  "template",
  "save-publish",
]);

const FIXED_CONTENT_KEYS: Partial<Record<SceneNode["type"], ReadonlySet<string>>> = {
  text: new Set(["text", "content"]),
  button: new Set(["label", "text"]),
};

export class EditorModeSystem implements EditorModeSystemAPI {
  private mode: EditorMode;
  private readonly listeners = new Set<() => void>();

  constructor(initialMode: EditorMode = "fixed") {
    this.mode = initialMode;
  }

  getSnapshot = (): EditorMode => this.mode;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setMode(mode: EditorMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.listeners.forEach((listener) => listener());
  }

  can(capability: EditorCapability, node?: SceneNode | null): boolean {
    if (this.mode === "independent") return true;
    if (FIXED_ALWAYS_ALLOWED.has(capability)) return true;
    if (capability === "replace-image") return node?.type === "image";
    if (capability === "edit-content") {
      return Boolean(node && FIXED_CONTENT_KEYS[node.type]);
    }
    return false;
  }

  filterContentPatch(
    node: SceneNode,
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    if (this.mode === "independent") return patch;
    const keys = FIXED_CONTENT_KEYS[node.type];
    if (!keys) return {};
    return Object.fromEntries(
      Object.entries(patch).filter(([key]) => keys.has(key)),
    );
  }
}

export const createEditorModeSystem = (initialMode: EditorMode = "fixed") =>
  new EditorModeSystem(initialMode);
