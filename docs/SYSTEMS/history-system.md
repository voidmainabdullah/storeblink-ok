# History System

## Purpose

Owns bounded undo and redo command stacks for one editor kernel.

## Owns

- Undo and redo stack entries.
- Stack limits and observable availability snapshots.
- Failure-safe stack pointer movement.

## Does NOT Own

- Full Scene Graph snapshots.
- Command execution policy.
- UI button state beyond its read-only snapshot.

## Public API

```ts
interface HistoryManagerAPI {
  record(command: Command): void;
  undo(context: CommandContext): void;
  redo(context: CommandContext): void;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
  getSnapshot(): HistorySnapshot;
  subscribe(listener: () => void): () => void;
}
```

## Depends On

- Reversible Command contracts.

## Folder

`src/engine/history/`

## State Ownership

Each `HistoryManager` exclusively owns its command arrays and immutable availability snapshot. The active editor receives a private instance from the kernel.

## Event Flow

Successful command dispatch records a command. Undo invokes `command.undo`; redo invokes `command.redo` or `execute`. Failed operations restore the command to its original stack.

## Performance Notes

History stores commands rather than whole-document snapshots and enforces a configurable maximum entry count.

## Known Pitfalls / Anti-Patterns

- Do not clear history during normal page navigation.
- Do not share one history manager across editor instances.
- Do not create history entries for preview or temporary interaction elevation.

## Extensibility

Command-specific merge logic can reduce stack noise without changing the history manager.
