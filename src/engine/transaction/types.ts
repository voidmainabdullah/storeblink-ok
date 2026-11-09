import type { CommandContext } from "@/engine/command";

export type TransactionStep<TContext extends CommandContext = CommandContext> = Readonly<{
  id: string;
  label: string;
  execute(context: TContext): void;
  rollback(context: TContext): void;
}>;

export type TransactionValidator<TContext extends CommandContext = CommandContext> = Readonly<{
  id: string;
  validate(context: TContext): void;
}>;

export type TransactionDefinition<TContext extends CommandContext = CommandContext> = Readonly<{
  id?: string;
  label: string;
  steps: readonly TransactionStep<TContext>[];
  validators?: readonly TransactionValidator<TContext>[];
  metadata?: Readonly<Record<string, unknown>>;
}>;

export type TransactionFailureStage = "execute" | "validate" | "rollback" | "undo";

export type TransactionSnapshot = Readonly<{
  activeTransactionId: string | null;
  committedCount: number;
  failedCount: number;
  lastCommittedId: string | null;
  lastFailure: Readonly<{
    transactionId: string;
    stage: TransactionFailureStage;
    message: string;
  }> | null;
}>;
