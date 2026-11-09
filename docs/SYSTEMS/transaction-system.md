# Transaction System

## Purpose

Commits multiple reversible system operations atomically as one command and one history entry.

## Owns

- Active transaction identity and status counters.
- Ordered execute, rollback, validation, undo, and redo coordination.
- Structured transaction failures.

## Does NOT Own

- Domain state changed by transaction steps.
- Independent persistence transactions outside its registered steps.
- History stack storage.

## Public API

```ts
interface TransactionManagerAPI {
  run<TContext extends CommandContext>(
    definition: TransactionDefinition<TContext>,
    context: TContext,
  ): string;
  getSnapshot(): TransactionSnapshot;
  subscribe(listener: () => void): () => void;
}
```

## Depends On

- Command System.
- History System through the injected command manager.

## Folder

`src/engine/transaction/`

## State Ownership

The manager owns only transaction runtime status. Each step owns explicit `execute` and `rollback` closures for its domain.

## Event Flow

Steps execute in order, validators run after all steps, and failure rolls completed steps back in reverse order. Successful transactions enter history once; undo rolls all steps back atomically and redo executes them again.

## Performance Notes

Transactions are for cross-domain boundaries, not pointer-move hot paths. Validation occurs once per commit.

## Known Pitfalls / Anti-Patterns

- Every step must be reversible.
- Do not dispatch nested transactions.
- Do not perform an irreversible network side effect without a compensating step or external idempotency contract.

## Extensibility

Additional domain contexts can extend `CommandContext` and provide domain-specific validators without changing the manager.
