import { createHistoryManager, history, type HistoryManager } from "@/engine/history";
import type { Command, CommandContext } from "./types";

export type CommandManagerOptions = {
  historyManager?: HistoryManager;
  onExecuted?: (command: Command) => void;
  onFailed?: (command: Command, error: unknown) => void;
};

export class CommandManager {
  readonly history: HistoryManager;
  private readonly onExecuted?: (command: Command) => void;
  private readonly onFailed?: (command: Command, error: unknown) => void;

  constructor(options: CommandManagerOptions = {}) {
    this.history = options.historyManager ?? createHistoryManager();
    this.onExecuted = options.onExecuted;
    this.onFailed = options.onFailed;
  }

  dispatch<TPayload>(command: Command<TPayload>, ctx: CommandContext): void {
    try {
      command.execute(ctx);
      this.history.record(command);
      this.onExecuted?.(command);
    } catch (error) {
      this.onFailed?.(command, error);
      throw error;
    }
  }
}

export const createCommandManager = (options?: CommandManagerOptions) => new CommandManager(options);

// Compatibility service for code outside the active EngineContext migration.
export const commandManager = createCommandManager({ historyManager: history });

export const dispatch = <TPayload>(command: Command<TPayload>, ctx: CommandContext): void => {
  commandManager.dispatch(command, ctx);
};
