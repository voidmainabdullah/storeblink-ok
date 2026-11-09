import type { Command, CommandContext } from "@/engine/command/types";
import { useHistoryStore } from "@/stores/history.store";

const DEFAULT_MAX_HISTORY = 100;

export type HistorySnapshot = Readonly<{
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
}>;

export type HistoryListener = () => void;

export type HistoryManagerOptions = {
  maxEntries?: number;
  onChange?: (snapshot: HistorySnapshot) => void;
  onApplied?: (action: "undo" | "redo", command: Command) => void;
};

const createSnapshot = (undoDepth: number, redoDepth: number): HistorySnapshot =>
  Object.freeze({
    canUndo: undoDepth > 0,
    canRedo: redoDepth > 0,
    undoDepth,
    redoDepth,
  });

export class HistoryManager {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];
  private readonly listeners = new Set<HistoryListener>();
  private readonly maxEntries: number;
  private readonly onChange?: (snapshot: HistorySnapshot) => void;
  private readonly onApplied?: (action: "undo" | "redo", command: Command) => void;
  private snapshot = createSnapshot(0, 0);

  constructor(options: HistoryManagerOptions = {}) {
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries ?? DEFAULT_MAX_HISTORY));
    this.onChange = options.onChange;
    this.onApplied = options.onApplied;
  }

  record(command: Command): void {
    const top = this.undoStack[this.undoStack.length - 1];
    const merged = top?.merge?.(command);
    if (merged) {
      this.undoStack[this.undoStack.length - 1] = merged;
    } else {
      this.undoStack.push(command);
      if (this.undoStack.length > this.maxEntries) this.undoStack.shift();
    }
    this.redoStack.length = 0;
    this.publish();
  }

  undo(ctx: CommandContext): void {
    const command = this.undoStack.pop();
    if (!command) return;
    try {
      command.undo(ctx);
      this.redoStack.push(command);
      this.onApplied?.("undo", command);
    } catch (error) {
      this.undoStack.push(command);
      throw error;
    } finally {
      this.publish();
    }
  }

  redo(ctx: CommandContext): void {
    const command = this.redoStack.pop();
    if (!command) return;
    try {
      (command.redo ?? command.execute)(ctx);
      this.undoStack.push(command);
      this.onApplied?.("redo", command);
    } catch (error) {
      this.redoStack.push(command);
      throw error;
    } finally {
      this.publish();
    }
  }

  canUndo(): boolean {
    return this.snapshot.canUndo;
  }

  canRedo(): boolean {
    return this.snapshot.canRedo;
  }

  clear(): void {
    if (!this.undoStack.length && !this.redoStack.length) return;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.publish();
  }

  getSnapshot = (): HistorySnapshot => this.snapshot;

  subscribe = (listener: HistoryListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(): void {
    this.snapshot = createSnapshot(this.undoStack.length, this.redoStack.length);
    this.onChange?.(this.snapshot);
    this.listeners.forEach((listener) => listener());
  }
}

export const createHistoryManager = (options?: HistoryManagerOptions) => new HistoryManager(options);

// Transitional singleton for modules that have not moved behind EngineContext yet.
// New editor runtimes register a private HistoryManager on their kernel.
export const history = createHistoryManager({
  onChange: ({ canUndo, canRedo }) => {
    useHistoryStore.getState().setAvailability({ canUndo, canRedo });
  },
});

export const recordDispatch = (command: Command): void => history.record(command);
export const undo = (ctx: CommandContext): void => history.undo(ctx);
export const redo = (ctx: CommandContext): void => history.redo(ctx);
export const canUndo = (): boolean => history.canUndo();
export const canRedo = (): boolean => history.canRedo();
export const clear = (): void => history.clear();
