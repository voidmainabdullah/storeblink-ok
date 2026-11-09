export type MigrationValidation = Readonly<{
  valid: boolean;
  issues: readonly string[];
}>;

export type MigrationRollbackMetadata = Readonly<{
  strategy: "restore-backup";
  description: string;
  affectedPaths: readonly string[];
}>;

export type DocumentMigration<TDocument extends object> = Readonly<{
  id: string;
  fromVersion: number;
  toVersion: number;
  validateBefore(document: Readonly<TDocument>): MigrationValidation;
  migrate(document: Readonly<TDocument>): TDocument;
  validateAfter(document: Readonly<TDocument>): MigrationValidation;
  rollbackMetadata: MigrationRollbackMetadata;
}>;

export type MigrationStepReport = Readonly<{
  migrationId: string;
  fromVersion: number;
  toVersion: number;
  status: "applied" | "failed";
  startedAt: string;
  completedAt: string;
  issues: readonly string[];
  rollbackMetadata: MigrationRollbackMetadata;
}>;

export type MigrationReport = Readonly<{
  id: string;
  sourceVersion: number;
  targetVersion: number;
  status: "succeeded" | "failed";
  startedAt: string;
  completedAt: string;
  steps: readonly MigrationStepReport[];
  failedStepId?: string;
  error?: string;
}>;

export type MigrationResult<TDocument extends object> = Readonly<{
  document: TDocument;
  backup: TDocument;
  report: MigrationReport;
}>;

export type MigrationRegistryOptions<TDocument extends object> = Readonly<{
  currentVersion: number;
  getVersion(document: Readonly<TDocument>): number;
  validateCurrent(document: Readonly<TDocument>): MigrationValidation;
  now?: () => Date;
  createId?: () => string;
}>;

