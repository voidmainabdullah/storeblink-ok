import type { Command } from "@/engine/command";
import type { DocumentMigrationError, MigrationResult } from "@/engine/migration";
import { DexieRecoveryRepository } from "./DexieRecoveryRepository";
import type {
  EditorRecoveryRepository,
  MigrationRecoveryRecord,
  RecoveryCommandAction,
  RecoveryCommandRecord,
  RecoveryConflictInput,
  RecoveryDraftRecord,
  RecoveryMetadata,
  RecoverySaveMode,
  RecoverySessionInput,
  RecoverySnapshotRecord,
  RevisionConflictRecord,
  SaveRetryRecord,
  StartupRecoveryCandidate,
} from "./types";

type ActiveRecoverySession = RecoverySessionInput & {
  sessionId: string;
  baseServerRevision: number;
  sequence: number;
};

type PendingRecoveryCommand = {
  active: ActiveRecoverySession;
  sequence: number;
  command: Command;
  action: RecoveryCommandAction;
  resolve: () => void;
  reject: (error: unknown) => void;
};

export type RecoveryRetryResult = Readonly<{
  revision: number;
}>;

export type RecoveryRetryOutcome = Readonly<{
  retryId: string;
  status: "saved" | "deferred" | "failed";
  currentDocumentSaved?: boolean;
  error?: string;
}>;

export type EditorRecoverySystemOptions = Readonly<{
  repository?: EditorRecoveryRepository;
  now?: () => Date;
  createId?: () => string;
  onStorageError?: (error: unknown) => void;
  commandBatchDelayMs?: number;
}>;

const clone = <T>(value: T): T => structuredClone(value);

const defaultId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const normalizeForChecksum = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalizeForChecksum);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizeForChecksum(entry)]),
  );
};

export const recoveryChecksum = (value: unknown): string => {
  const source = JSON.stringify(normalizeForChecksum(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const safePayload = (value: unknown): unknown => {
  try {
    return clone(value);
  } catch {
    return null;
  }
};

const documentCounts = (value: unknown): { nodes: number; pages: number } => {
  const document = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const scene = document.engine_scene && typeof document.engine_scene === "object"
    ? document.engine_scene as Record<string, unknown>
    : {};
  const nodes = scene.nodes && typeof scene.nodes === "object" && !Array.isArray(scene.nodes)
    ? Object.keys(scene.nodes as Record<string, unknown>).length
    : 0;
  const pageDocument = document.engine_page_document && typeof document.engine_page_document === "object"
    ? document.engine_page_document as Record<string, unknown>
    : {};
  const pages = Array.isArray(pageDocument.pages) ? pageDocument.pages.length : nodes ? 1 : 0;
  return { nodes, pages };
};

export class EditorRecoverySystem {
  private readonly repository: EditorRecoveryRepository;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly onStorageError?: (error: unknown) => void;
  private readonly commandBatchDelayMs: number;
  private active: ActiveRecoverySession | null = null;
  private pending: Promise<void> = Promise.resolve();
  private commandBatch: PendingRecoveryCommand[] = [];
  private commandBatchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: EditorRecoverySystemOptions = {}) {
    this.repository = options.repository ?? new DexieRecoveryRepository();
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? defaultId;
    this.onStorageError = options.onStorageError;
    this.commandBatchDelayMs = Math.max(0, options.commandBatchDelayMs ?? 24);
  }

  async startSession(input: RecoverySessionInput): Promise<StartupRecoveryCandidate | null> {
    await this.waitForIdle();
    if (!input.storeId.trim()) throw new Error("Recovery session requires a store id.");
    const validation = input.validateDocument(input.serverDocument);
    if (!validation.valid) {
      throw new Error(`Server document cannot seed recovery: ${validation.issues.join("; ")}`);
    }
    const [draft, metadata, commands] = await Promise.all([
      this.repository.getDraft(input.storeId),
      this.repository.getMetadata(input.storeId),
      this.repository.listCommands(input.storeId),
    ]);
    const sessionId = this.createId();
    this.active = {
      ...input,
      sessionId,
      baseServerRevision: input.serverRevision,
      sequence: commands.reduce((maximum, command) => Math.max(maximum, command.sequence), 0),
    };
    const serverSnapshot = this.snapshot(
      input.storeId,
      "server-load",
      input.serverDocument,
      input.serverRevision,
    );
    await this.repository.putSnapshot(serverSnapshot);

    const isDirty = Boolean(draft && metadata?.dirty);
    const differsFromServer = Boolean(
      draft && draft.checksum !== recoveryChecksum(input.serverDocument),
    );
    if (draft && isDirty && differsFromServer) {
      const local = documentCounts(draft.document);
      const server = documentCounts(input.serverDocument);
      const candidate: StartupRecoveryCandidate = {
        storeId: input.storeId,
        draft,
        serverDocument: clone(input.serverDocument),
        serverRevision: input.serverRevision,
        commandCount: commands.length,
        hasServerConflict: draft.baseServerRevision !== input.serverRevision,
        summary: {
          localNodeCount: local.nodes,
          serverNodeCount: server.nodes,
          nodeDelta: local.nodes - server.nodes,
          localPageCount: local.pages,
          serverPageCount: server.pages,
          pageDelta: local.pages - server.pages,
        },
      };
      if (candidate.hasServerConflict) {
        await this.captureConflict({
          storeId: input.storeId,
          localBaseRevision: draft.baseServerRevision,
          serverRevision: input.serverRevision,
          localDocument: draft.document,
          serverDocument: input.serverDocument,
        });
      }
      return candidate;
    }

    await this.repository.deleteDraft(input.storeId);
    await this.repository.clearCommands(input.storeId);
    await this.repository.putMetadata({
      storeId: input.storeId,
      sessionId,
      baseServerRevision: input.serverRevision,
      dirty: false,
      lastCommandAt: null,
      lastSavedAt: metadata?.lastSavedAt ?? null,
      lastValidSnapshotId: serverSnapshot.id,
      updatedAt: this.now().toISOString(),
    });
    return null;
  }

  recordCommand(command: Command, action: RecoveryCommandAction = "execute"): Promise<void> {
    const active = this.active;
    if (!active) return Promise.resolve();
    active.sequence += 1;
    const sequence = active.sequence;
    return new Promise<void>((resolve, reject) => {
      this.commandBatch.push({ active, sequence, command, action, resolve, reject });
      if (this.commandBatchTimer !== null) return;
      this.commandBatchTimer = setTimeout(() => {
        this.commandBatchTimer = null;
        void this.flushCommandBatch().catch(() => undefined);
      }, this.commandBatchDelayMs);
    });
  }

  private flushCommandBatch(): Promise<void> {
    if (this.commandBatchTimer !== null) {
      clearTimeout(this.commandBatchTimer);
      this.commandBatchTimer = null;
    }
    const batch = this.commandBatch.splice(0);
    if (batch.length === 0) return Promise.resolve();

    const active = batch[0].active;
    const current = active.getCurrentDocument();
    const validation = active.validateDocument(current.document);
    if (!validation.valid) {
      const error = new Error(`Recovery rejected invalid draft: ${validation.issues.join("; ")}`);
      this.onStorageError?.(error);
      batch.forEach((entry) => entry.reject(error));
      return Promise.reject(error);
    }
    const capturedDocument = clone(current.document);
    const capturedRevision = current.localRevision;
    const operation = this.enqueue(async () => {
      const recordedAt = this.now().toISOString();
      const commandRecords: RecoveryCommandRecord[] = batch.map(({ command, action, sequence }) => ({
        id: this.createId(),
        storeId: active.storeId,
        sessionId: active.sessionId,
        sequence,
        action,
        commandId: command.id,
        commandType: command.type,
        commandLabel: command.label,
        commandTimestamp: command.timestamp,
        payload: safePayload(command.payload),
        recordedAt,
      }));
      const draft: RecoveryDraftRecord = {
        storeId: active.storeId,
        sessionId: active.sessionId,
        documentVersion: active.getDocumentVersion(capturedDocument),
        localRevision: capturedRevision,
        baseServerRevision: active.baseServerRevision,
        document: capturedDocument,
        checksum: recoveryChecksum(capturedDocument),
        savedAt: recordedAt,
      };
      const previous = await this.repository.getMetadata(active.storeId);
      const metadata: RecoveryMetadata = {
        storeId: active.storeId,
        sessionId: active.sessionId,
        baseServerRevision: active.baseServerRevision,
        dirty: true,
        lastCommandAt: recordedAt,
        lastSavedAt: previous?.lastSavedAt ?? null,
        lastValidSnapshotId: previous?.lastValidSnapshotId ?? null,
        updatedAt: recordedAt,
      };
      await this.repository.recordMutations({ draft, commands: commandRecords, metadata });
    });
    operation.then(
      () => batch.forEach((entry) => entry.resolve()),
      (error) => batch.forEach((entry) => entry.reject(error)),
    );
    return operation;
  }

  async restoreCandidate(candidate: StartupRecoveryCandidate): Promise<unknown> {
    const active = this.requireActive(candidate.storeId);
    active.baseServerRevision = candidate.serverRevision;
    const now = this.now().toISOString();
    const draft: RecoveryDraftRecord = {
      ...candidate.draft,
      sessionId: active.sessionId,
      baseServerRevision: candidate.serverRevision,
      savedAt: now,
    };
    await this.repository.putMetadata({
      storeId: active.storeId,
      sessionId: active.sessionId,
      baseServerRevision: candidate.serverRevision,
      dirty: true,
      lastCommandAt: now,
      lastSavedAt: null,
      lastValidSnapshotId: null,
      updatedAt: now,
    });
    const syntheticCommand: RecoveryCommandRecord = {
      id: this.createId(),
      storeId: active.storeId,
      sessionId: active.sessionId,
      sequence: ++active.sequence,
      action: "execute",
      commandId: "recovery-restore",
      commandType: "recovery.restore",
      commandLabel: "Restore recovered draft",
      commandTimestamp: this.now().getTime(),
      payload: { previousBaseRevision: candidate.draft.baseServerRevision },
      recordedAt: now,
    };
    const metadata = await this.repository.getMetadata(active.storeId);
    await this.repository.recordMutation({
      draft,
      command: syntheticCommand,
      metadata: metadata as RecoveryMetadata,
    });
    return clone(candidate.draft.document);
  }

  async discardCandidate(candidate: StartupRecoveryCandidate): Promise<void> {
    const active = this.requireActive(candidate.storeId);
    active.baseServerRevision = candidate.serverRevision;
    await Promise.all([
      this.repository.deleteDraft(active.storeId),
      this.repository.clearCommands(active.storeId),
      this.repository.clearDraftRetries(active.storeId),
    ]);
    await this.repository.putMetadata({
      storeId: active.storeId,
      sessionId: active.sessionId,
      baseServerRevision: candidate.serverRevision,
      dirty: false,
      lastCommandAt: null,
      lastSavedAt: null,
      lastValidSnapshotId: null,
      updatedAt: this.now().toISOString(),
    });
  }

  async markSaved(serverRevision: number, document: unknown, force = false): Promise<boolean> {
    await this.flushCommandBatch();
    return this.schedule(async () => {
      const active = this.requireActive();
      const validation = active.validateDocument(document);
      if (!validation.valid) {
        throw new Error(`Cannot mark invalid recovery document as saved: ${validation.issues.join("; ")}`);
      }
      active.baseServerRevision = serverRevision;
      const liveDocumentMatches =
        recoveryChecksum(active.getCurrentDocument().document) === recoveryChecksum(document);
      if (!force && !liveDocumentMatches) {
        const existing = await this.repository.getMetadata(active.storeId);
        if (existing) {
          await this.repository.putMetadata({
            ...existing,
            sessionId: active.sessionId,
            baseServerRevision: serverRevision,
            updatedAt: this.now().toISOString(),
          });
        }
        return false;
      }
      const savedAt = this.now().toISOString();
      const snapshot = this.snapshot(active.storeId, "last-valid", document, serverRevision);
      await this.repository.markSaved({
        storeId: active.storeId,
        metadata: {
          storeId: active.storeId,
          sessionId: active.sessionId,
          baseServerRevision: serverRevision,
          dirty: false,
          lastCommandAt: null,
          lastSavedAt: savedAt,
          lastValidSnapshotId: snapshot.id,
          updatedAt: savedAt,
        },
        snapshot,
      });
      return true;
    });
  }

  acknowledgeServerRevision(serverRevision: number): Promise<void> {
    return this.enqueue(async () => {
      const active = this.requireActive();
      active.baseServerRevision = serverRevision;
      const existing = await this.repository.getMetadata(active.storeId);
      if (!existing) return;
      await this.repository.putMetadata({
        ...existing,
        sessionId: active.sessionId,
        baseServerRevision: serverRevision,
        updatedAt: this.now().toISOString(),
      });
    });
  }

  async queueSave(
    mode: RecoverySaveMode,
    document: unknown,
    baseServerRevision: number,
    error: unknown,
  ): Promise<SaveRetryRecord> {
    const active = this.requireActive();
    const validation = active.validateDocument(document);
    if (!validation.valid) {
      throw new Error(`Invalid document cannot enter save retry queue: ${validation.issues.join("; ")}`);
    }
    if (mode === "draft") await this.repository.clearDraftRetries(active.storeId);
    const createdAt = this.now().toISOString();
    const retry: SaveRetryRecord = {
      id: this.createId(),
      storeId: active.storeId,
      mode,
      document: clone(document),
      checksum: recoveryChecksum(document),
      baseServerRevision,
      attempts: 0,
      createdAt,
      nextAttemptAt: createdAt,
      lastError: error instanceof Error ? error.message : String(error),
    };
    await this.repository.enqueueRetry(retry);
    return retry;
  }

  async retryPending(
    handler: (retry: SaveRetryRecord) => Promise<RecoveryRetryResult>,
    failurePolicy: (
      error: unknown,
      retry: SaveRetryRecord,
    ) => "retry" | "discard" | Promise<"retry" | "discard"> = () => "retry",
  ): Promise<RecoveryRetryOutcome[]> {
    const active = this.requireActive();
    const retries = await this.repository.listRetries(active.storeId);
    const outcomes: RecoveryRetryOutcome[] = [];
    for (const retry of retries) {
      if (new Date(retry.nextAttemptAt).getTime() > this.now().getTime()) {
        outcomes.push({ retryId: retry.id, status: "deferred" });
        continue;
      }
      try {
        const result = await handler(retry);
        active.baseServerRevision = result.revision;
        await this.repository.deleteRetry(retry.id);
        const currentDocumentSaved = await this.markSaved(result.revision, retry.document);
        outcomes.push({ retryId: retry.id, status: "saved", currentDocumentSaved });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (await failurePolicy(error, retry) === "discard") {
          await this.repository.deleteRetry(retry.id);
          outcomes.push({ retryId: retry.id, status: "failed", error: message });
          break;
        }
        const attempts = retry.attempts + 1;
        const delay = Math.min(300_000, 1_000 * (2 ** Math.min(attempts, 8)));
        await this.repository.updateRetry({
          ...retry,
          attempts,
          nextAttemptAt: new Date(this.now().getTime() + delay).toISOString(),
          lastError: message,
        });
        outcomes.push({ retryId: retry.id, status: "failed", error: message });
        break;
      }
    }
    return outcomes;
  }

  async captureConflict(input: RecoveryConflictInput): Promise<RevisionConflictRecord> {
    const active = this.requireActive(input.storeId);
    const localChecksum = recoveryChecksum(input.localDocument);
    const serverChecksum = recoveryChecksum(input.serverDocument);
    const existing = (await this.repository.listConflicts(input.storeId)).find(
      (conflict) =>
        conflict.status === "unresolved" &&
        conflict.localChecksum === localChecksum &&
        conflict.serverChecksum === serverChecksum &&
        conflict.localBaseRevision === input.localBaseRevision &&
        conflict.serverRevision === input.serverRevision,
    );
    if (existing) return clone(existing);
    const commands = await this.repository.listCommands(input.storeId);
    const createdAt = this.now().toISOString();
    const conflict: RevisionConflictRecord = {
      id: this.createId(),
      storeId: input.storeId,
      sessionId: active.sessionId,
      localBaseRevision: input.localBaseRevision,
      serverRevision: input.serverRevision,
      localDocument: clone(input.localDocument),
      serverDocument: clone(input.serverDocument),
      localChecksum,
      serverChecksum,
      localCommands: commands,
      status: "unresolved",
      createdAt,
      resolvedAt: null,
    };
    await Promise.all([
      this.repository.putConflict(conflict),
      this.repository.putSnapshot(this.snapshot(input.storeId, "conflict-local", input.localDocument, input.localBaseRevision)),
      this.repository.putSnapshot(this.snapshot(input.storeId, "conflict-server", input.serverDocument, input.serverRevision)),
    ]);
    return clone(conflict);
  }

  async resolveConflict(
    conflictId: string,
    resolution: "keep-local" | "use-server",
  ): Promise<unknown> {
    const conflict = await this.repository.getConflict(conflictId);
    if (!conflict) throw new Error("Recovery conflict was not found.");
    const active = this.requireActive(conflict.storeId);
    const resolvedAt = this.now().toISOString();
    await this.repository.putConflict({ ...conflict, status: resolution, resolvedAt });
    active.baseServerRevision = conflict.serverRevision;
    if (resolution === "use-server") {
      await this.markSaved(conflict.serverRevision, conflict.serverDocument, true);
      return clone(conflict.serverDocument);
    }
    const validation = active.validateDocument(conflict.localDocument);
    if (!validation.valid) {
      throw new Error(`Recovered local conflict copy is invalid: ${validation.issues.join("; ")}`);
    }
    const current = active.getCurrentDocument();
    const draft: RecoveryDraftRecord = {
      storeId: active.storeId,
      sessionId: active.sessionId,
      documentVersion: active.getDocumentVersion(conflict.localDocument),
      localRevision: current.localRevision,
      baseServerRevision: conflict.serverRevision,
      document: clone(conflict.localDocument),
      checksum: conflict.localChecksum,
      savedAt: resolvedAt,
    };
    const command: RecoveryCommandRecord = {
      id: this.createId(),
      storeId: active.storeId,
      sessionId: active.sessionId,
      sequence: ++active.sequence,
      action: "execute",
      commandId: "conflict-keep-local",
      commandType: "recovery.conflict.keep-local",
      commandLabel: "Keep local recovery copy",
      commandTimestamp: this.now().getTime(),
      payload: { conflictId },
      recordedAt: resolvedAt,
    };
    await this.repository.recordMutation({
      draft,
      command,
      metadata: {
        storeId: active.storeId,
        sessionId: active.sessionId,
        baseServerRevision: conflict.serverRevision,
        dirty: true,
        lastCommandAt: resolvedAt,
        lastSavedAt: null,
        lastValidSnapshotId: null,
        updatedAt: resolvedAt,
      },
    });
    return clone(conflict.localDocument);
  }

  async listUnresolvedConflicts(storeId?: string): Promise<RevisionConflictRecord[]> {
    const target = storeId ?? this.requireActive().storeId;
    const conflicts = await this.repository.listConflicts(target);
    return conflicts.filter((conflict) => conflict.status === "unresolved");
  }

  async captureMigration(
    storeId: string,
    result: MigrationResult<Record<string, unknown>>,
  ): Promise<MigrationRecoveryRecord> {
    const record: MigrationRecoveryRecord = {
      id: result.report.id,
      storeId,
      backup: clone(result.backup),
      migratedDocument: result.report.status === "succeeded" ? clone(result.document) : null,
      report: clone(result.report),
      createdAt: this.now().toISOString(),
    };
    await this.repository.putMigration(record);
    await this.repository.putSnapshot(this.snapshot(storeId, "migration-backup", result.backup, result.report.sourceVersion));
    return record;
  }

  async captureMigrationFailure(
    storeId: string,
    error: DocumentMigrationError<Record<string, unknown>>,
  ): Promise<MigrationRecoveryRecord> {
    const record: MigrationRecoveryRecord = {
      id: error.report.id,
      storeId,
      backup: clone(error.backup),
      migratedDocument: null,
      report: clone(error.report),
      createdAt: this.now().toISOString(),
    };
    await this.repository.putMigration(record);
    await this.repository.putSnapshot(
      this.snapshot(storeId, "migration-backup", error.backup, error.report.sourceVersion),
    );
    return record;
  }

  async waitForIdle(): Promise<void> {
    await this.flushCommandBatch();
    await this.pending;
  }

  dispose(): void {
    void this.waitForIdle().finally(() => this.repository.close());
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    return this.schedule(operation);
  }

  private schedule<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.pending.then(operation, operation);
    this.pending = run.then(
      () => undefined,
      (error) => {
      this.onStorageError?.(error);
      },
    );
    return run;
  }

  private snapshot(
    storeId: string,
    kind: RecoverySnapshotRecord["kind"],
    document: unknown,
    serverRevision: number,
  ): RecoverySnapshotRecord {
    return {
      id: this.createId(),
      storeId,
      kind,
      document: clone(document),
      checksum: recoveryChecksum(document),
      serverRevision,
      createdAt: this.now().toISOString(),
    };
  }

  private requireActive(storeId?: string): ActiveRecoverySession {
    if (!this.active) throw new Error("Recovery session has not been started.");
    if (storeId && this.active.storeId !== storeId) {
      throw new Error(`Recovery session belongs to ${this.active.storeId}, not ${storeId}.`);
    }
    return this.active;
  }
}

export const createEditorRecoverySystem = (options?: EditorRecoverySystemOptions) =>
  new EditorRecoverySystem(options);
