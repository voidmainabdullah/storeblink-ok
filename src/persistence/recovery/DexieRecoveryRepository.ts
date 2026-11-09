import Dexie, { type DexieOptions, type Table } from "dexie";
import type {
  EditorRecoveryRepository,
  MigrationRecoveryRecord,
  RecoveryCommandRecord,
  RecoveryDraftRecord,
  RecoveryMetadata,
  RecoveryMutationBatchWrite,
  RecoveryMutationWrite,
  RecoverySavedWrite,
  RecoverySnapshotRecord,
  RevisionConflictRecord,
  SaveRetryRecord,
} from "./types";

class EditorRecoveryDatabase extends Dexie {
  drafts!: Table<RecoveryDraftRecord, string>;
  commands!: Table<RecoveryCommandRecord, string>;
  metadata!: Table<RecoveryMetadata, string>;
  snapshots!: Table<RecoverySnapshotRecord, string>;
  retries!: Table<SaveRetryRecord, string>;
  conflicts!: Table<RevisionConflictRecord, string>;
  migrations!: Table<MigrationRecoveryRecord, string>;

  constructor(name: string, options?: DexieOptions) {
    super(name, options);
    this.version(1).stores({
      drafts: "&storeId, savedAt, baseServerRevision",
      commands: "&id, [storeId+sequence], storeId, sessionId, recordedAt",
      metadata: "&storeId, updatedAt, dirty",
      snapshots: "&id, [storeId+createdAt], storeId, kind, createdAt",
      retries: "&id, [storeId+createdAt], storeId, mode, nextAttemptAt",
      conflicts: "&id, [storeId+createdAt], storeId, status, createdAt",
      migrations: "&id, [storeId+createdAt], storeId, createdAt",
    });
  }
}

const clone = <T>(value: T): T => structuredClone(value);

export class DexieRecoveryRepository implements EditorRecoveryRepository {
  private readonly database: EditorRecoveryDatabase;

  constructor(
    databaseName = "storeblink-editor-recovery",
    options?: DexieOptions,
  ) {
    this.database = new EditorRecoveryDatabase(databaseName, options);
  }

  async recordMutation(write: RecoveryMutationWrite): Promise<void> {
    await this.recordMutations({
      draft: write.draft,
      commands: [write.command],
      metadata: write.metadata,
    });
  }

  async recordMutations(write: RecoveryMutationBatchWrite): Promise<void> {
    await this.database.transaction(
      "rw",
      this.database.drafts,
      this.database.commands,
      this.database.metadata,
      async () => {
        await this.database.drafts.put(clone(write.draft));
        await this.database.commands.bulkPut(write.commands.map(clone));
        await this.database.metadata.put(clone(write.metadata));
      },
    );
  }

  async getDraft(storeId: string): Promise<RecoveryDraftRecord | null> {
    const record = await this.database.drafts.get(storeId);
    return record ? clone(record) : null;
  }

  async deleteDraft(storeId: string): Promise<void> {
    await this.database.drafts.delete(storeId);
  }

  async listCommands(storeId: string): Promise<RecoveryCommandRecord[]> {
    const records = await this.database.commands.where("storeId").equals(storeId).sortBy("sequence");
    return records.map(clone);
  }

  async clearCommands(storeId: string): Promise<void> {
    await this.database.commands.where("storeId").equals(storeId).delete();
  }

  async getMetadata(storeId: string): Promise<RecoveryMetadata | null> {
    const record = await this.database.metadata.get(storeId);
    return record ? clone(record) : null;
  }

  async putMetadata(metadata: RecoveryMetadata): Promise<void> {
    await this.database.metadata.put(clone(metadata));
  }

  async markSaved(write: RecoverySavedWrite): Promise<void> {
    await this.database.transaction(
      "rw",
      this.database.drafts,
      this.database.commands,
      this.database.metadata,
      this.database.snapshots,
      async () => {
        await this.database.drafts.delete(write.storeId);
        await this.database.commands.where("storeId").equals(write.storeId).delete();
        await this.database.metadata.put(clone(write.metadata));
        await this.database.snapshots.put(clone(write.snapshot));
      },
    );
  }

  async putSnapshot(snapshot: RecoverySnapshotRecord): Promise<void> {
    await this.database.snapshots.put(clone(snapshot));
  }

  async getSnapshot(id: string): Promise<RecoverySnapshotRecord | null> {
    const record = await this.database.snapshots.get(id);
    return record ? clone(record) : null;
  }

  async listSnapshots(storeId: string, limit = 20): Promise<RecoverySnapshotRecord[]> {
    const records = await this.database.snapshots
      .where("storeId")
      .equals(storeId)
      .reverse()
      .sortBy("createdAt");
    return records.slice(0, Math.max(1, limit)).map(clone);
  }

  async enqueueRetry(retry: SaveRetryRecord): Promise<void> {
    await this.database.retries.put(clone(retry));
  }

  async listRetries(storeId: string): Promise<SaveRetryRecord[]> {
    const records = await this.database.retries.where("storeId").equals(storeId).sortBy("createdAt");
    return records.map(clone);
  }

  async updateRetry(retry: SaveRetryRecord): Promise<void> {
    await this.database.retries.put(clone(retry));
  }

  async deleteRetry(id: string): Promise<void> {
    await this.database.retries.delete(id);
  }

  async clearDraftRetries(storeId: string): Promise<void> {
    await this.database.retries
      .where("storeId")
      .equals(storeId)
      .filter((record) => record.mode === "draft")
      .delete();
  }

  async putConflict(conflict: RevisionConflictRecord): Promise<void> {
    await this.database.conflicts.put(clone(conflict));
  }

  async getConflict(id: string): Promise<RevisionConflictRecord | null> {
    const record = await this.database.conflicts.get(id);
    return record ? clone(record) : null;
  }

  async listConflicts(storeId: string): Promise<RevisionConflictRecord[]> {
    const records = await this.database.conflicts.where("storeId").equals(storeId).sortBy("createdAt");
    return records.reverse().map(clone);
  }

  async putMigration(record: MigrationRecoveryRecord): Promise<void> {
    await this.database.migrations.put(clone(record));
  }

  async listMigrations(storeId: string): Promise<MigrationRecoveryRecord[]> {
    const records = await this.database.migrations.where("storeId").equals(storeId).sortBy("createdAt");
    return records.reverse().map(clone);
  }

  close(): void {
    this.database.close();
  }

  async deleteDatabase(): Promise<void> {
    this.close();
    await Dexie.delete(this.database.name);
  }
}
