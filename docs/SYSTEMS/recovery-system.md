# Recovery System

## Purpose

Persist validated unsaved editor work locally, retry failed saves, preserve revision conflicts, and provide restart-safe evidence for migration and publication recovery.

## Owns

- The latest validated local draft per store.
- The unsaved command journal and recovery session metadata.
- The local save retry queue and retry backoff state.
- Last-valid, server-load, migration, and conflict snapshots.
- Durable local revision-conflict records.

## Does NOT Own

- Live Scene Graph state.
- Command execution or undo/redo ordering.
- Server revisions and publication snapshots.
- Migration logic or document validation rules.
- The decision to restore, discard, or publish a recovered copy.

## Public API

```ts
interface EditorRecoveryAPI {
  startSession(input: RecoverySessionInput): Promise<StartupRecoveryCandidate | null>;
  recordCommand(command: Command, action?: "execute" | "undo" | "redo"): Promise<void>;
  restoreCandidate(candidate: StartupRecoveryCandidate): Promise<unknown>;
  discardCandidate(candidate: StartupRecoveryCandidate): Promise<void>;
  markSaved(serverRevision: number, document: unknown): Promise<void>;
  queueSave(mode: "draft" | "publish", document: unknown, baseRevision: number, error: unknown): Promise<SaveRetryRecord>;
  retryPending(handler: SaveRetryHandler): Promise<RecoveryRetryOutcome[]>;
  captureConflict(input: RecoveryConflictInput): Promise<RevisionConflictRecord>;
  resolveConflict(id: string, resolution: "keep-local" | "use-server"): Promise<unknown>;
}
```

## Depends On

- Command and History events
- Migration validation contract
- Dexie / IndexedDB
- Publishing service callback supplied by the editor orchestration layer

## Folder

`src/persistence/recovery/`

## State Ownership

The system exclusively writes the `storeblink-editor-recovery` IndexedDB database. Live document stores remain command-owned.

## Event Flow

Command/undo/redo succeeds -> obtain current versioned document -> validate -> atomically store command, draft, and metadata. Save succeeds -> clear working draft/journal and write a last-valid snapshot. Save fails -> queue a validated immutable document. Startup compares server and local checksums, then exposes Restore, Preview differences, or Discard without silently replacing either copy.

## Performance Notes

Writes are asynchronous and serialized outside pointer/render work. One command creates one atomic IndexedDB transaction. Draft retry entries are coalesced so only the newest failed draft save remains pending.

## Known Pitfalls / Anti-Patterns

- Never write an unvalidated document to recovery storage.
- Never let IndexedDB failure abort the already-committed Scene Graph command.
- Never retry revision conflicts as network failures.
- Never clear a newer local draft when an older queued document finishes saving.
- Never collapse local and server conflict copies into one record.

## Extensibility

The repository interface supports an alternate durable adapter. Additional snapshot kinds and remote recovery transport can be added without changing command or Scene Graph systems.
