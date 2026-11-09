import type {
  DocumentMigration,
  MigrationRegistryOptions,
  MigrationReport,
  MigrationResult,
  MigrationStepReport,
  MigrationValidation,
} from "./types";

const clone = <T>(value: T): T => structuredClone(value);

const deepFreeze = <T>(value: T): Readonly<T> => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value as Record<string, unknown>).forEach((entry) => deepFreeze(entry));
  return Object.freeze(value);
};

const assertVersion = (value: number, label: string): number => {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer; received ${String(value)}.`);
  }
  return value;
};

const validationError = (label: string, validation: MigrationValidation): Error | null =>
  validation.valid
    ? null
    : new Error(`${label}: ${validation.issues.join("; ") || "validation failed"}`);

const defaultId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `migration-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export class DocumentMigrationError<TDocument extends object> extends Error {
  readonly backup: TDocument;
  readonly report: MigrationReport;
  readonly cause: unknown;

  constructor(message: string, backup: TDocument, report: MigrationReport, cause: unknown) {
    super(message);
    this.name = "DocumentMigrationError";
    this.backup = clone(backup);
    this.report = clone(report);
    this.cause = cause;
  }
}

export class MigrationRegistry<TDocument extends object> {
  private readonly migrations = new Map<number, DocumentMigration<TDocument>>();
  private readonly currentVersion: number;
  private readonly getVersion: MigrationRegistryOptions<TDocument>["getVersion"];
  private readonly validateCurrent: MigrationRegistryOptions<TDocument>["validateCurrent"];
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(options: MigrationRegistryOptions<TDocument>) {
    this.currentVersion = assertVersion(options.currentVersion, "Current document version");
    this.getVersion = options.getVersion;
    this.validateCurrent = options.validateCurrent;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? defaultId;
  }

  register(migration: DocumentMigration<TDocument>): void {
    if (!migration.id.trim()) throw new Error("Document migration id is required.");
    assertVersion(migration.fromVersion, `Migration ${migration.id} fromVersion`);
    if (migration.toVersion !== migration.fromVersion + 1) {
      throw new Error(`Migration ${migration.id} must advance exactly one document version.`);
    }
    if (migration.toVersion > this.currentVersion) {
      throw new Error(`Migration ${migration.id} exceeds current document version ${this.currentVersion}.`);
    }
    if (this.migrations.has(migration.fromVersion)) {
      throw new Error(`A document migration from version ${migration.fromVersion} is already registered.`);
    }
    this.migrations.set(migration.fromVersion, Object.freeze(migration));
  }

  plan(fromVersion: number, toVersion = this.currentVersion): readonly DocumentMigration<TDocument>[] {
    assertVersion(fromVersion, "Source document version");
    assertVersion(toVersion, "Target document version");
    if (fromVersion > this.currentVersion) {
      throw new Error(
        `Document version ${fromVersion} is newer than supported version ${this.currentVersion}.`,
      );
    }
    if (toVersion > this.currentVersion) {
      throw new Error(`Target document version ${toVersion} is not supported.`);
    }
    if (toVersion < fromVersion) throw new Error("Document migrations cannot run backwards.");
    const plan: DocumentMigration<TDocument>[] = [];
    for (let version = fromVersion; version < toVersion; version += 1) {
      const migration = this.migrations.get(version);
      if (!migration) throw new Error(`Missing document migration ${version} -> ${version + 1}.`);
      plan.push(migration);
    }
    return plan;
  }

  migrate(document: TDocument, targetVersion = this.currentVersion): MigrationResult<TDocument> {
    const backup = clone(document);
    const startedAt = this.now().toISOString();
    const reportId = this.createId();
    const steps: MigrationStepReport[] = [];
    let sourceVersion = 0;
    let current = clone(document);
    let activeMigration: DocumentMigration<TDocument> | null = null;
    let activeStartedAt = startedAt;

    try {
      sourceVersion = assertVersion(this.getVersion(current), "Source document version");
      const plan = this.plan(sourceVersion, targetVersion);
      for (const migration of plan) {
        activeMigration = migration;
        activeStartedAt = this.now().toISOString();
        const before = migration.validateBefore(deepFreeze(clone(current)));
        const beforeError = validationError(`Migration ${migration.id} pre-validation failed`, before);
        if (beforeError) throw beforeError;

        const frozenInput = deepFreeze(clone(current));
        const migrated = migration.migrate(frozenInput);
        if (migrated === frozenInput) {
          throw new Error(`Migration ${migration.id} must return a new document.`);
        }
        const actualVersion = this.getVersion(migrated);
        if (actualVersion !== migration.toVersion) {
          throw new Error(
            `Migration ${migration.id} returned version ${actualVersion}; expected ${migration.toVersion}.`,
          );
        }
        const after = migration.validateAfter(deepFreeze(clone(migrated)));
        const afterError = validationError(`Migration ${migration.id} post-validation failed`, after);
        if (afterError) throw afterError;
        current = clone(migrated);
        steps.push({
          migrationId: migration.id,
          fromVersion: migration.fromVersion,
          toVersion: migration.toVersion,
          status: "applied",
          startedAt: activeStartedAt,
          completedAt: this.now().toISOString(),
          issues: [],
          rollbackMetadata: migration.rollbackMetadata,
        });
        activeMigration = null;
      }

      const currentValidation = this.validateCurrent(deepFreeze(clone(current)));
      const currentError = validationError("Current document validation failed", currentValidation);
      if (currentError) throw currentError;
      const completedAt = this.now().toISOString();
      return {
        document: clone(current),
        backup,
        report: {
          id: reportId,
          sourceVersion,
          targetVersion,
          status: "succeeded",
          startedAt,
          completedAt,
          steps,
        },
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Document migration failed.";
      if (activeMigration) {
        steps.push({
          migrationId: activeMigration.id,
          fromVersion: activeMigration.fromVersion,
          toVersion: activeMigration.toVersion,
          status: "failed",
          startedAt: activeStartedAt,
          completedAt: this.now().toISOString(),
          issues: [message],
          rollbackMetadata: activeMigration.rollbackMetadata,
        });
      }
      const report: MigrationReport = {
        id: reportId,
        sourceVersion,
        targetVersion,
        status: "failed",
        startedAt,
        completedAt: this.now().toISOString(),
        steps,
        ...(activeMigration ? { failedStepId: activeMigration.id } : {}),
        error: message,
      };
      throw new DocumentMigrationError(message, backup, report, cause);
    }
  }
}
