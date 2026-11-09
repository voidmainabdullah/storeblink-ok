import type { Command, CommandContext, CommandManager } from "@/engine/command";
import type {
  TransactionDefinition,
  TransactionFailureStage,
  TransactionSnapshot,
  TransactionStep,
} from "./types";

const transactionId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `transaction-${crypto.randomUUID()}`;
  }
  return `transaction-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const messageFor = (error: unknown): string => error instanceof Error ? error.message : String(error);

export class TransactionError extends Error {
  readonly transactionId: string;
  readonly stage: TransactionFailureStage;
  readonly causeError: unknown;
  readonly rollbackErrors: readonly unknown[];

  constructor(
    id: string,
    stage: TransactionFailureStage,
    cause: unknown,
    rollbackErrors: readonly unknown[] = [],
  ) {
    const rollbackSuffix = rollbackErrors.length
      ? ` Rollback also failed ${rollbackErrors.length} time(s).`
      : "";
    super(`Transaction ${id} failed during ${stage}: ${messageFor(cause)}.${rollbackSuffix}`);
    this.name = "TransactionError";
    this.transactionId = id;
    this.stage = stage;
    this.causeError = cause;
    this.rollbackErrors = rollbackErrors;
  }
}

const rollbackExecuted = <TContext extends CommandContext>(
  steps: readonly TransactionStep<TContext>[],
  context: TContext,
): unknown[] => {
  const rollbackErrors: unknown[] = [];
  [...steps].reverse().forEach((step) => {
    try {
      step.rollback(context);
    } catch (error) {
      rollbackErrors.push(error);
    }
  });
  return rollbackErrors;
};

const executeAtomically = <TContext extends CommandContext>(
  definition: TransactionDefinition<TContext>,
  context: TContext,
  id: string,
): void => {
  const executed: TransactionStep<TContext>[] = [];
  try {
    definition.steps.forEach((step) => {
      step.execute(context);
      executed.push(step);
    });
  } catch (error) {
    throw new TransactionError(id, "execute", error, rollbackExecuted(executed, context));
  }

  try {
    definition.validators?.forEach((validator) => validator.validate(context));
  } catch (error) {
    throw new TransactionError(id, "validate", error, rollbackExecuted(executed, context));
  }
};

const undoAtomically = <TContext extends CommandContext>(
  definition: TransactionDefinition<TContext>,
  context: TContext,
  id: string,
): void => {
  const rolledBack: TransactionStep<TContext>[] = [];
  const reversed = [...definition.steps].reverse();
  try {
    reversed.forEach((step) => {
      step.rollback(context);
      rolledBack.push(step);
    });
  } catch (error) {
    const restoreErrors: unknown[] = [];
    [...rolledBack].reverse().forEach((step) => {
      try {
        step.execute(context);
      } catch (restoreError) {
        restoreErrors.push(restoreError);
      }
    });
    throw new TransactionError(id, "undo", error, restoreErrors);
  }
};

export class TransactionManager {
  private readonly listeners = new Set<() => void>();
  private snapshot: TransactionSnapshot = Object.freeze({
    activeTransactionId: null,
    committedCount: 0,
    failedCount: 0,
    lastCommittedId: null,
    lastFailure: null,
  });

  constructor(private readonly commands: CommandManager) {}

  run<TContext extends CommandContext>(definition: TransactionDefinition<TContext>, context: TContext): string {
    if (!definition.steps.length) throw new Error("A transaction requires at least one reversible step.");
    const id = definition.id ?? transactionId();
    if (this.snapshot.activeTransactionId) {
      throw new Error(`Transaction ${this.snapshot.activeTransactionId} is already active.`);
    }
    this.update({ activeTransactionId: id, lastFailure: null });
    const command: Command = {
      id,
      type: "transaction",
      label: definition.label,
      timestamp: Date.now(),
      payload: {
        stepIds: definition.steps.map((step) => step.id),
        metadata: definition.metadata ?? {},
      },
      execute: (commandContext) => executeAtomically(definition, commandContext as TContext, id),
      undo: (commandContext) => undoAtomically(definition, commandContext as TContext, id),
      redo: (commandContext) => executeAtomically(definition, commandContext as TContext, id),
    };

    try {
      this.commands.dispatch(command, context);
      this.update({
        activeTransactionId: null,
        committedCount: this.snapshot.committedCount + 1,
        lastCommittedId: id,
      });
      return id;
    } catch (error) {
      const transactionError = error instanceof TransactionError ? error : new TransactionError(id, "execute", error);
      this.update({
        activeTransactionId: null,
        failedCount: this.snapshot.failedCount + 1,
        lastFailure: {
          transactionId: id,
          stage: transactionError.stage,
          message: transactionError.message,
        },
      });
      throw transactionError;
    }
  }

  getSnapshot = (): TransactionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(patch: Partial<TransactionSnapshot>): void {
    this.snapshot = Object.freeze({ ...this.snapshot, ...patch });
    this.listeners.forEach((listener) => listener());
  }
}

export const createTransactionManager = (commands: CommandManager) => new TransactionManager(commands);
