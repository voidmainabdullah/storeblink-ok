import { describe, expect, it } from "vitest";
import { createBuiltInNodeSchemaRegistry } from "@/engine/node-schema";
import { createSceneNode } from "@/engine/scene-graph";
import type { SceneTree } from "@/types";
import {
  CURRENT_ENGINE_DOCUMENT_VERSION,
  DocumentMigrationError,
  ENGINE_DOCUMENT_VERSION_KEY,
  createEditorDocumentMigrationSystem,
} from "./index";

const legacyScene = (): SceneTree => {
  const root = createSceneNode({ id: "root", type: "section", name: "Root" }, null, 1);
  const image = createSceneNode({
    id: "image",
    type: "image",
    name: "Legacy image",
    props: { src: "/chair.jpg", fit: "contain" },
  }, root.id, 1);
  root.childIds = [image.id];
  return { rootNodeId: root.id, nodes: { [root.id]: root, [image.id]: image } };
};

describe("EditorDocumentMigrationSystem", () => {
  it("migrates a real v1 document and every page node without mutating the backup", () => {
    const system = createEditorDocumentMigrationSystem(createBuiltInNodeSchemaRegistry());
    const scene = legacyScene();
    const source = {
      engine_scene: scene,
      engine_page_document: {
        version: 1,
        homePageId: "home",
        pages: [{ id: "home", title: "Home", slug: "home", kind: "home", scene }],
      },
    };

    const result = system.migrate(source);
    expect(result.document[ENGINE_DOCUMENT_VERSION_KEY]).toBe(CURRENT_ENGINE_DOCUMENT_VERSION);
    const migratedScene = result.document.engine_scene as SceneTree;
    expect(migratedScene.nodes.image.props).toMatchObject({ objectFit: "contain" });
    expect(migratedScene.nodes.image.props).not.toHaveProperty("fit");
    expect(migratedScene.nodes.image.extensions?.nodeSchemaVersion).toBe(2);
    expect(migratedScene.nodes.root.extensions?.nodeSchemaVersion).toBe(1);
    expect(result.nodeMigrations).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: "image", migrationIds: ["image-fit-to-object-fit-v2"] }),
    ]));
    expect(result.report.steps.map((step) => step.migrationId)).toEqual([
      "engine-document-v1-to-v2",
      "node-schema-normalization",
    ]);
    expect(source).not.toHaveProperty(ENGINE_DOCUMENT_VERSION_KEY);
    expect((source.engine_scene as SceneTree).nodes.image.props).toHaveProperty("fit", "contain");
    expect(result.backup).toEqual(source);
  });

  it("fails closed on future document versions and keeps the original backup", () => {
    const system = createEditorDocumentMigrationSystem(createBuiltInNodeSchemaRegistry());
    const source = {
      [ENGINE_DOCUMENT_VERSION_KEY]: 99,
      engine_scene: legacyScene(),
    };
    try {
      system.migrate(source);
      throw new Error("Migration unexpectedly succeeded.");
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentMigrationError);
      const migrationError = error as DocumentMigrationError<typeof source>;
      expect(migrationError.backup).toEqual(source);
      expect(migrationError.report.status).toBe("failed");
      expect(migrationError.message).toContain("newer than supported");
    }
  });

  it("rejects future node schemas without modifying the merchant document", () => {
    const system = createEditorDocumentMigrationSystem(createBuiltInNodeSchemaRegistry());
    const scene = legacyScene();
    scene.nodes.image.extensions = { nodeSchemaVersion: 99 };
    const source = { engine_scene: scene };
    expect(() => system.migrate(source)).toThrow("newer than supported schema");
    expect(scene.nodes.image.extensions?.nodeSchemaVersion).toBe(99);
  });
});

