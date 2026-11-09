import { validateSceneTree } from "@/engine/validation";
import type { NodeSchemaRegistryAPI, SceneNodeMigrationResult } from "@/engine/node-schema";
import type { SceneTree } from "@/types";
import { DocumentMigrationError, MigrationRegistry } from "./MigrationRegistry";
import type {
  MigrationReport,
  MigrationResult,
  MigrationStepReport,
  MigrationValidation,
} from "./types";

export const ENGINE_DOCUMENT_VERSION_KEY = "engine_document_version";
export const CURRENT_ENGINE_DOCUMENT_VERSION = 2;
export const ENGINE_SCENE_DOCUMENT_KEY = "engine_scene";
export const ENGINE_PAGE_DOCUMENT_KEY = "engine_page_document";

export type EditorEngineDocument = Record<string, unknown>;

export type EditorDocumentMigrationResult = MigrationResult<EditorEngineDocument> & Readonly<{
  nodeMigrations: readonly Readonly<{
    sceneId: string;
    nodeId: string;
    nodeType: string;
    migrationIds: readonly string[];
  }>[];
}>;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const validatePageDocument = (
  value: unknown,
  nodeSchemas: NodeSchemaRegistryAPI,
): string[] => {
  if (value === undefined) return [];
  const document = asRecord(value);
  if (!document) return [`${ENGINE_PAGE_DOCUMENT_KEY} must be an object.`];
  const pages = document.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    return [`${ENGINE_PAGE_DOCUMENT_KEY}.pages must contain at least one page.`];
  }
  const issues: string[] = [];
  const pageIds = new Set<string>();
  pages.forEach((candidate, index) => {
    const page = asRecord(candidate);
    if (!page) {
      issues.push(`${ENGINE_PAGE_DOCUMENT_KEY}.pages.${index} must be an object.`);
      return;
    }
    const pageId = typeof page.id === "string" ? page.id : "";
    if (!pageId) issues.push(`${ENGINE_PAGE_DOCUMENT_KEY}.pages.${index}.id is required.`);
    else if (pageIds.has(pageId)) issues.push(`${ENGINE_PAGE_DOCUMENT_KEY}.pages contains duplicate id ${pageId}.`);
    else pageIds.add(pageId);
    try {
      const scene = validateSceneTree(page.scene);
      const validation = nodeSchemas.validateTree(scene);
      validation.issues.forEach((issue) =>
        issues.push(`${ENGINE_PAGE_DOCUMENT_KEY}.pages.${index}.${issue.nodeId}.${issue.path}: ${issue.message}`),
      );
    } catch (error) {
      issues.push(
        `${ENGINE_PAGE_DOCUMENT_KEY}.pages.${index}.scene: ${error instanceof Error ? error.message : "invalid scene"}`,
      );
    }
  });
  if (typeof document.homePageId !== "string" || !pageIds.has(document.homePageId)) {
    issues.push(`${ENGINE_PAGE_DOCUMENT_KEY}.homePageId must reference an existing page.`);
  }
  return issues;
};

const validateDocument = (
  document: Readonly<EditorEngineDocument>,
  nodeSchemas: NodeSchemaRegistryAPI,
): MigrationValidation => {
  const issues: string[] = [];
  try {
    const scene = validateSceneTree(document[ENGINE_SCENE_DOCUMENT_KEY]);
    const validation = nodeSchemas.validateTree(scene);
    validation.issues.forEach((issue) =>
      issues.push(`${ENGINE_SCENE_DOCUMENT_KEY}.${issue.nodeId}.${issue.path}: ${issue.message}`),
    );
  } catch (error) {
    issues.push(
      `${ENGINE_SCENE_DOCUMENT_KEY}: ${error instanceof Error ? error.message : "invalid scene"}`,
    );
  }
  issues.push(...validatePageDocument(document[ENGINE_PAGE_DOCUMENT_KEY], nodeSchemas));
  return { valid: issues.length === 0, issues };
};

const documentVersion = (document: Readonly<EditorEngineDocument>): number => {
  const raw = document[ENGINE_DOCUMENT_VERSION_KEY];
  if (raw === undefined) return 1;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw new Error(`${ENGINE_DOCUMENT_VERSION_KEY} must be a positive integer.`);
  }
  return raw;
};

const replaceScene = (
  document: EditorEngineDocument,
  key: string,
  nodeSchemas: NodeSchemaRegistryAPI,
): SceneNodeMigrationResult => {
  const migrated = nodeSchemas.migrateTree(validateSceneTree(document[key]));
  document[key] = migrated.tree;
  return migrated;
};

const migrateDocumentNodes = (
  input: EditorEngineDocument,
  nodeSchemas: NodeSchemaRegistryAPI,
): {
  document: EditorEngineDocument;
  nodeMigrations: EditorDocumentMigrationResult["nodeMigrations"];
} => {
  const document = structuredClone(input);
  const nodeMigrations: Array<{
    sceneId: string;
    nodeId: string;
    nodeType: string;
    migrationIds: readonly string[];
  }> = [];
  const home = replaceScene(document, ENGINE_SCENE_DOCUMENT_KEY, nodeSchemas);
  home.appliedMigrations.forEach((migration) =>
    nodeMigrations.push({ sceneId: "home-compatibility", ...migration }),
  );

  const pageDocument = asRecord(document[ENGINE_PAGE_DOCUMENT_KEY]);
  if (pageDocument && Array.isArray(pageDocument.pages)) {
    const pages = pageDocument.pages.map((candidate, index) => {
      const page = asRecord(candidate);
      if (!page) return candidate;
      const scene = nodeSchemas.migrateTree(validateSceneTree(page.scene));
      scene.appliedMigrations.forEach((migration) =>
        nodeMigrations.push({
          sceneId: typeof page.id === "string" ? page.id : `page-${index}`,
          ...migration,
        }),
      );
      return { ...page, scene: scene.tree };
    });
    document[ENGINE_PAGE_DOCUMENT_KEY] = { ...pageDocument, pages };
  }
  return { document, nodeMigrations };
};

const migrationStep = (
  report: MigrationReport,
  status: MigrationStepReport["status"],
  issues: readonly string[] = [],
): MigrationStepReport => ({
  migrationId: "node-schema-normalization",
  fromVersion: report.targetVersion,
  toVersion: report.targetVersion,
  status,
  startedAt: report.completedAt,
  completedAt: new Date().toISOString(),
  issues,
  rollbackMetadata: {
    strategy: "restore-backup",
    description: "Restore the complete pre-migration editor document.",
    affectedPaths: [ENGINE_SCENE_DOCUMENT_KEY, ENGINE_PAGE_DOCUMENT_KEY],
  },
});

export class EditorDocumentMigrationSystem {
  readonly currentVersion = CURRENT_ENGINE_DOCUMENT_VERSION;
  private readonly registry: MigrationRegistry<EditorEngineDocument>;

  constructor(private readonly nodeSchemas: NodeSchemaRegistryAPI) {
    this.registry = new MigrationRegistry<EditorEngineDocument>({
      currentVersion: CURRENT_ENGINE_DOCUMENT_VERSION,
      getVersion: documentVersion,
      validateCurrent: (document) => validateDocument(document, nodeSchemas),
    });
    this.registry.register({
      id: "engine-document-v1-to-v2",
      fromVersion: 1,
      toVersion: 2,
      validateBefore: (document) => validateDocument(document, nodeSchemas),
      migrate: (document) => ({
        ...structuredClone(document),
        [ENGINE_DOCUMENT_VERSION_KEY]: 2,
      }),
      validateAfter: (document) => validateDocument(document, nodeSchemas),
      rollbackMetadata: {
        strategy: "restore-backup",
        description: "Restore the complete version 1 Engine Scene document.",
        affectedPaths: [ENGINE_DOCUMENT_VERSION_KEY, ENGINE_SCENE_DOCUMENT_KEY, ENGINE_PAGE_DOCUMENT_KEY],
      },
    });
  }

  isEngineDocument(value: unknown): value is EditorEngineDocument {
    const document = asRecord(value);
    return Boolean(document && Object.prototype.hasOwnProperty.call(document, ENGINE_SCENE_DOCUMENT_KEY));
  }

  getVersion(document: Readonly<EditorEngineDocument>): number {
    return documentVersion(document);
  }

  migrate(document: EditorEngineDocument): EditorDocumentMigrationResult {
    const baseResult = this.registry.migrate(document);
    try {
      const normalized = migrateDocumentNodes(baseResult.document, this.nodeSchemas);
      const changed = JSON.stringify(normalized.document) !== JSON.stringify(baseResult.document);
      const report: MigrationReport = changed
        ? {
            ...baseResult.report,
            completedAt: new Date().toISOString(),
            steps: [...baseResult.report.steps, migrationStep(baseResult.report, "applied")],
          }
        : baseResult.report;
      const finalValidation = validateDocument(normalized.document, this.nodeSchemas);
      if (!finalValidation.valid) {
        throw new Error(`Migrated document is invalid: ${finalValidation.issues.join("; ")}`);
      }
      return {
        ...baseResult,
        document: normalized.document,
        report,
        nodeMigrations: normalized.nodeMigrations,
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Node schema migration failed.";
      const failedStep = migrationStep(baseResult.report, "failed", [message]);
      const report: MigrationReport = {
        ...baseResult.report,
        status: "failed",
        completedAt: failedStep.completedAt,
        steps: [...baseResult.report.steps, failedStep],
        failedStepId: failedStep.migrationId,
        error: message,
      };
      throw new DocumentMigrationError(message, baseResult.backup, report, cause);
    }
  }

  validateCurrent(document: EditorEngineDocument): MigrationValidation {
    try {
      if (documentVersion(document) !== this.currentVersion) {
        return {
          valid: false,
          issues: [`Expected document version ${this.currentVersion}.`],
        };
      }
      return validateDocument(document, this.nodeSchemas);
    } catch (error) {
      return { valid: false, issues: [error instanceof Error ? error.message : "Invalid editor document."] };
    }
  }
}

export const createEditorDocumentMigrationSystem = (nodeSchemas: NodeSchemaRegistryAPI) =>
  new EditorDocumentMigrationSystem(nodeSchemas);

