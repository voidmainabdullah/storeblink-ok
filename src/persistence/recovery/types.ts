import type { MigrationReport } from "@/engine/migration";

export type RecoverySaveMode = "draft" | "publish";
export type RecoveryCommandAction = "execute" | "undo" | "redo";

export type RecoveryDraftRecord = Readonly<{
  storeId: string;
  sessionId: string;
  documentVersion: number;
  localRevision: number;
  baseServerRevision: number;
  document: unknown;
  checksum: string;
  savedAt: string;
}>;

export type RecoveryCommandRecord = Readonly<{
  id: string;
  storeId: string;
  sessionId: string;
  sequence: number;
  action: RecoveryCommandAction;
  commandId: string;
  commandType: string;
  commandLabel: string;
  commandTimestamp: number;
  payload: unknown;
  recordedAt: string;
}>;

export type RecoveryMetadata = Readonly<{
  storeId: string;
  sessionId: string;
  baseServerRevision: number;
  dirty: boolean;
  lastCommandAt: string | null;
  lastSavedAt: string | null;
  lastValidSnapshotId: string | null;
  updatedAt: string;
}>;

export type RecoverySnapshotKind =
  | "last-valid"
  | "server-load"
  | "migration-backup"
  | "conflict-local"
  | "conflict-server";

export type RecoverySnapshotRecord = Readonly<{
  id: string;
  storeId: string;
  kind: RecoverySnapshotKind;
  document: unknown;
  checksum: string;
  serverRevision: number;
  createdAt: string;
  metadata?: Readonly<Record<string, unknown>>;
}>;

export type SaveRetryRecord = Readonly<{
  id: string;
  storeId: string;
  mode: RecoverySaveMode;
  document: unknown;
  checksum: string;
  baseServerRevision: number;
  attempts: number;
  createdAt: string;
  nextAttemptAt: string;
  lastError: string;
}>;

export type RevisionConflictStatus = "unresolved" | "keep-local" | "use-server";

export type RevisionConflictRecord = Readonly<{
  id: string;
  storeId: string;
  sessionId: string;
  localBaseRevision: number;
  serverRevision: number;
  localDocument: unknown;
  serverDocument: unknown;
  localChecksum: string;
  serverChecksum: string;
  localCommands: readonly RecoveryCommandRecord[];
  status: RevisionConflictStatus;
  createdAt: string;
  resolvedAt: string | null;
}>;

export type MigrationRecoveryRecord = Readonly<{
  id: string;
  storeId: string;
  backup: unknown;
  migratedDocument: unknown | null;
  report: MigrationReport;
  createdAt: string;
}>;

export type RecoveryMutationWrite = Readonly<{
  draft: RecoveryDraftRecord;
  command: RecoveryCommandRecord;
  metadata: RecoveryMetadata;
}>;

export type RecoveryMutationBatchWrite = Readonly<{
  draft: RecoveryDraftRecord;
  commands: readonly RecoveryCommandRecord[];
  metadata: RecoveryMetadata;
}>;

export type RecoverySavedWrite = Readonly<{
  storeId: string;
  metadata: RecoveryMetadata;
  snapshot: RecoverySnapshotRecord;
}>;

export interface EditorRecoveryRepository {
  recordMutation(write: RecoveryMutationWrite): Promise<void>;
  recordMutations(write: RecoveryMutationBatchWrite): Promise<void>;
  getDraft(storeId: string): Promise<RecoveryDraftRecord | null>;
  deleteDraft(storeId: string): Promise<void>;
  listCommands(storeId: string): Promise<RecoveryCommandRecord[]>;
  clearCommands(storeId: string): Promise<void>;
  getMetadata(storeId: string): Promise<RecoveryMetadata | null>;
  putMetadata(metadata: RecoveryMetadata): Promise<void>;
  markSaved(write: RecoverySavedWrite): Promise<void>;
  putSnapshot(snapshot: RecoverySnapshotRecord): Promise<void>;
  getSnapshot(id: string): Promise<RecoverySnapshotRecord | null>;
  listSnapshots(storeId: string, limit?: number): Promise<RecoverySnapshotRecord[]>;
  enqueueRetry(retry: SaveRetryRecord): Promise<void>;
  listRetries(storeId: string): Promise<SaveRetryRecord[]>;
  updateRetry(retry: SaveRetryRecord): Promise<void>;
  deleteRetry(id: string): Promise<void>;
  clearDraftRetries(storeId: string): Promise<void>;
  putConflict(conflict: RevisionConflictRecord): Promise<void>;
  getConflict(id: string): Promise<RevisionConflictRecord | null>;
  listConflicts(storeId: string): Promise<RevisionConflictRecord[]>;
  putMigration(record: MigrationRecoveryRecord): Promise<void>;
  listMigrations(storeId: string): Promise<MigrationRecoveryRecord[]>;
  close(): void;
}

export type StartupRecoveryCandidate = Readonly<{
  storeId: string;
  draft: RecoveryDraftRecord;
  serverDocument: unknown;
  serverRevision: number;
  commandCount: number;
  hasServerConflict: boolean;
  summary: Readonly<{
    localNodeCount: number;
    serverNodeCount: number;
    nodeDelta: number;
    localPageCount: number;
    serverPageCount: number;
    pageDelta: number;
  }>;
}>;

export type RecoveryConflictInput = Readonly<{
  storeId: string;
  localBaseRevision: number;
  serverRevision: number;
  localDocument: unknown;
  serverDocument: unknown;
}>;

export type RecoverySessionInput = Readonly<{
  storeId: string;
  serverRevision: number;
  serverDocument: unknown;
  getCurrentDocument(): Readonly<{
    document: unknown;
    localRevision: number;
  }>;
  validateDocument(document: unknown): Readonly<{
    valid: boolean;
    issues: readonly string[];
  }>;
  getDocumentVersion(document: unknown): number;
}>;
