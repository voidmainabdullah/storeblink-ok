export type ThemeDocument<T = unknown> = {
  themeId: string;
  themeVersion: string;
  schemaVersion: number;
  payload: T;
  recoveredContent?: unknown[];
};

export type ThemeMigrationValidation = {
  valid: boolean;
  errors: string[];
};

export type ThemeMigration = {
  id: string;
  themeId: string;
  fromSchemaVersion: number;
  toSchemaVersion: number;
  migrate(document: ThemeDocument): ThemeDocument;
  validate(document: ThemeDocument): ThemeMigrationValidation;
  rollback?(document: ThemeDocument): ThemeDocument;
};

export type ThemeMigrationResult = {
  document: ThemeDocument;
  backup: ThemeDocument;
  appliedMigrationIds: string[];
};

export class ThemeMigrationError extends Error {
  readonly backup: ThemeDocument;
  readonly appliedMigrationIds: string[];
  readonly cause: unknown;

  constructor(
    message: string,
    backup: ThemeDocument,
    appliedMigrationIds: string[],
    cause: unknown,
  ) {
    super(message);
    this.name = "ThemeMigrationError";
    this.backup = cloneDocument(backup);
    this.appliedMigrationIds = [...appliedMigrationIds];
    this.cause = cause;
  }
}

export type SafeThemeMigrationResult =
  | { ok: true; result: ThemeMigrationResult }
  | { ok: false; backup: ThemeDocument; error: ThemeMigrationError };

const cloneDocument = (document: ThemeDocument): ThemeDocument => structuredClone(document);

export class ThemeMigrationSystem {
  private readonly migrations = new Map<string, ThemeMigration>();

  register(migration: ThemeMigration): void {
    if (migration.toSchemaVersion !== migration.fromSchemaVersion + 1) {
      throw new Error(`Theme migration ${migration.id} must advance exactly one schema version.`);
    }
    const key = this.key(migration.themeId, migration.fromSchemaVersion);
    if (this.migrations.has(key)) {
      throw new Error(
        `A migration for ${migration.themeId} schema ${migration.fromSchemaVersion} is already registered.`,
      );
    }
    this.migrations.set(key, migration);
  }

  plan(themeId: string, fromSchemaVersion: number, toSchemaVersion: number): ThemeMigration[] {
    if (toSchemaVersion < fromSchemaVersion) {
      throw new Error("Theme migrations cannot run backwards.");
    }
    const plan: ThemeMigration[] = [];
    let version = fromSchemaVersion;
    while (version < toSchemaVersion) {
      const migration = this.migrations.get(this.key(themeId, version));
      if (!migration) {
        throw new Error(`Missing ${themeId} migration ${version} -> ${version + 1}.`);
      }
      plan.push(migration);
      version = migration.toSchemaVersion;
    }
    return plan;
  }

  migrate(document: ThemeDocument, targetSchemaVersion: number): ThemeMigrationResult {
    const backup = cloneDocument(document);
    let current = cloneDocument(document);
    const appliedMigrationIds: string[] = [];

    try {
      const plan = this.plan(document.themeId, document.schemaVersion, targetSchemaVersion);
      for (const migration of plan) {
        const input = cloneDocument(current);
        const migrated = migration.migrate(input);
        if (migrated === input) {
          throw new Error(`Theme migration ${migration.id} mutated and returned its input.`);
        }
        if (migrated.schemaVersion !== migration.toSchemaVersion) {
          throw new Error(
            `Theme migration ${migration.id} returned schema ${migrated.schemaVersion}; expected ${migration.toSchemaVersion}.`,
          );
        }
        const validation = migration.validate(migrated);
        if (!validation.valid) {
          throw new Error(
            `Theme migration ${migration.id} failed validation: ${validation.errors.join("; ")}`,
          );
        }
        current = cloneDocument(migrated);
        appliedMigrationIds.push(migration.id);
      }
    } catch (error) {
      throw new ThemeMigrationError(
        error instanceof Error ? error.message : "Theme migration failed.",
        backup,
        appliedMigrationIds,
        error,
      );
    }

    return { document: current, backup, appliedMigrationIds };
  }

  migrateSafely(document: ThemeDocument, targetSchemaVersion: number): SafeThemeMigrationResult {
    try {
      return { ok: true, result: this.migrate(document, targetSchemaVersion) };
    } catch (error) {
      const migrationError =
        error instanceof ThemeMigrationError
          ? error
          : new ThemeMigrationError(
              error instanceof Error ? error.message : "Theme migration failed.",
              document,
              [],
              error,
            );
      return {
        ok: false,
        backup: cloneDocument(migrationError.backup),
        error: migrationError,
      };
    }
  }

  private key(themeId: string, fromSchemaVersion: number): string {
    return `${themeId}:${fromSchemaVersion}`;
  }
}
