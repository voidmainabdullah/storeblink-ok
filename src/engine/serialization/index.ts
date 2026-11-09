import type { Project } from "@/types";
import { validateProject } from "@/engine/validation";
import { MigrationRegistry, type MigrationValidation } from "@/engine/migration";

export const CURRENT_SCHEMA_VERSION = 2;

export type SerializedProject = string;

const validProject = (project: Readonly<Project>, expectedVersion?: number): MigrationValidation => {
  try {
    const validated = validateProject(project);
    if (expectedVersion !== undefined && validated.schemaVersion !== expectedVersion) {
      return { valid: false, issues: [`Expected project schema ${expectedVersion}.`] };
    }
    return { valid: true, issues: [] };
  } catch (error) {
    return { valid: false, issues: [error instanceof Error ? error.message : "Invalid project."] };
  }
};

const projectMigrations = new MigrationRegistry<Project>({
  currentVersion: CURRENT_SCHEMA_VERSION,
  getVersion: (project) => project.schemaVersion,
  validateCurrent: (project) => validProject(project, CURRENT_SCHEMA_VERSION),
});

projectMigrations.register({
  id: "project-v1-to-v2",
  fromVersion: 1,
  toVersion: 2,
  validateBefore: (project) => validProject(project, 1),
  migrate: (project) => ({ ...structuredClone(project), schemaVersion: 2 }),
  validateAfter: (project) => validProject(project, 2),
  rollbackMetadata: {
    strategy: "restore-backup",
    description: "Restore the complete project v1 payload.",
    affectedPaths: ["schemaVersion"],
  },
});

export const migrate = (
  project: Project,
  fromVersion = project.schemaVersion,
  toVersion = CURRENT_SCHEMA_VERSION,
): Project => {
  if (fromVersion !== project.schemaVersion) {
    throw new Error(
      `Project migration source ${fromVersion} does not match document schema ${project.schemaVersion}.`,
    );
  }
  return projectMigrations.migrate(validateProject(project), toVersion).document;
};

export const projectToJson = (project: Project): SerializedProject => {
  const validated = validateProject({ ...project, schemaVersion: project.schemaVersion ?? CURRENT_SCHEMA_VERSION });
  return JSON.stringify(migrate(validated));
};

export const jsonToProject = (json: string): Project => {
  const parsed = JSON.parse(json) as unknown;
  const project = validateProject(parsed);
  return migrate(project, project.schemaVersion, CURRENT_SCHEMA_VERSION);
};

export const projectToObject = (project: Project): Project =>
  validateProject(JSON.parse(projectToJson(project)) as unknown);

export const objectToProject = (value: unknown): Project => {
  const project = validateProject(value);
  return migrate(project, project.schemaVersion, CURRENT_SCHEMA_VERSION);
};

// Clipboard serialization will hook in here in the Persistence Layer.
