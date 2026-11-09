# Command System

## Purpose

Provides the only sanctioned mutation entry point for Scene Graph document state and records successful commands in the matching history manager.

## Owns

- Command dispatch ordering.
- Command factories and command payload contracts.
- Association with one kernel-owned `HistoryManager`.

## Does NOT Own

- Scene data.
- Undo and redo stacks.
- Live transform preview state.

## Public API

```ts
interface CommandManagerAPI {
  readonly history: HistoryManager;
  dispatch<T>(command: Command<T>, context: CommandContext): void;
}

const createCommandManager: (options?: {
  historyManager?: HistoryManager;
}) => CommandManager;
```

## Depends On

- Scene Graph API supplied in `CommandContext`.
- History System.

## Folder

`src/engine/command/`

## State Ownership

The system owns no document store. A command may write through the command-capable Scene Graph adapter; successful dispatch records exactly one history entry.

## Event Flow

UI action creates a command, the manager executes it against the scoped Scene Graph, the graph emits invalidation events, then the manager records the command in scoped history.

## Performance Notes

Transform interactions keep frame-by-frame changes in preview state and dispatch one command on release. Merge-capable commands can coalesce related mutations.

## Known Pitfalls / Anti-Patterns

- Never mutate the scene store directly from UI.
- Never record a command before successful execution.
- Never dispatch pointer-move commands for live transforms.

## Extensibility

New document operations add typed command factories while retaining the shared `Command` execute/undo/redo contract.
