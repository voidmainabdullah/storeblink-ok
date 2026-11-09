import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { afterEach, describe, expect, it } from "vitest";
import type { Command } from "@/engine/command";
import { DexieRecoveryRepository } from "./DexieRecoveryRepository";
import { EditorRecoverySystem } from "./EditorRecoverySystem";

const databaseNames: string[] = [];

const repository = () => {
  const name = `recovery-test-${Math.random().toString(36).slice(2)}`;
  databaseNames.push(name);
  return new DexieRecoveryRepository(name, { indexedDB, IDBKeyRange });
};

const document = (text: string) => ({
  engine_document_version: 2,
  engine_scene: {
    rootNodeId: "root",
    nodes: {
      root: {
        id: "root",
        type: "section",
        name: "Root",
        parentId: null,
        childIds: [],
        props: { text },
        style: { fills: [], strokes: [], effects: [], opacity: 1 },
        layout: { mode: "absolute" },
        transform: {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          skewX: 0,
          skewY: 0,
          transformOrigin: [0.5, 0.5],
          zIndex: 0,
        },
        meta: { locked: false, hidden: false, createdAt: 1, updatedAt: 1 },
      },
    },
  },
});

const command = (id = "command-1"): Command => ({
  id,
  type: "test.update",
  label: "Update test document",
  timestamp: 100,
  payload: { text: "Local" },
  execute: () => undefined,
  undo: () => undefined,
});

const session = (
  storeId: string,
  serverRevision: number,
  serverDocument: unknown,
  current: { document: unknown; revision: number },
) => ({
  storeId,
  serverRevision,
  serverDocument,
  getCurrentDocument: () => ({ document: current.document, localRevision: current.revision }),
  validateDocument: (value: unknown) => ({
    valid: Boolean(value && typeof value === "object" && "engine_scene" in value),
    issues: [],
  }),
  getDocumentVersion: (value: unknown) =>
    Number((value as { engine_document_version?: number }).engine_document_version ?? 1),
});

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  })));
});

describe("EditorRecoverySystem", () => {
  it("restores a validated draft and command journal after a new browser session", async () => {
    const store = repository();
    const current = { document: document("Server"), revision: 1 };
    const first = new EditorRecoverySystem({ repository: store });
    expect(await first.startSession(session("store-1", 4, current.document, current))).toBeNull();

    current.document = document("Unsaved local edit");
    current.revision = 2;
    await first.recordCommand(command());
    first.dispose();

    const reopenedStore = new DexieRecoveryRepository(databaseNames[0], { indexedDB, IDBKeyRange });
    const reopened = new EditorRecoverySystem({ repository: reopenedStore });
    const nextCurrent = { document: document("Server"), revision: 1 };
    const candidate = await reopened.startSession(session("store-1", 4, nextCurrent.document, nextCurrent));

    expect(candidate).not.toBeNull();
    expect(candidate?.commandCount).toBe(1);
    expect(candidate?.hasServerConflict).toBe(false);
    expect(await reopened.restoreCandidate(candidate!)).toEqual(document("Unsaved local edit"));
    expect((await reopenedStore.getMetadata("store-1"))?.dirty).toBe(true);
    reopened.dispose();
  });

  it("retries offline saves with bounded backoff and clears matching recovery state", async () => {
    const store = repository();
    let clock = Date.parse("2026-08-01T00:00:00.000Z");
    let id = 0;
    const current = { document: document("Server"), revision: 1 };
    const recovery = new EditorRecoverySystem({
      repository: store,
      now: () => new Date(clock),
      createId: () => `id-${++id}`,
    });
    await recovery.startSession(session("store-2", 1, current.document, current));
    current.document = document("Offline local edit");
    current.revision = 2;
    await recovery.recordCommand(command());
    await recovery.queueSave("draft", current.document, 1, new Error("offline"));

    const failed = await recovery.retryPending(async () => {
      throw new Error("still offline");
    });
    expect(failed[0]).toMatchObject({ status: "failed", error: "still offline" });
    expect((await store.listRetries("store-2"))[0].attempts).toBe(1);

    clock += 3_000;
    const saved = await recovery.retryPending(async () => ({ revision: 2 }));
    expect(saved[0].status).toBe("saved");
    expect(await store.listRetries("store-2")).toEqual([]);
    expect(await store.getDraft("store-2")).toBeNull();
    expect((await store.getMetadata("store-2"))?.dirty).toBe(false);
    recovery.dispose();
  });

  it("preserves local and server documents when the base revision changed", async () => {
    const store = repository();
    const current = { document: document("Server v1"), revision: 1 };
    const first = new EditorRecoverySystem({ repository: store });
    await first.startSession(session("store-3", 1, current.document, current));
    current.document = document("Local based on v1");
    current.revision = 2;
    await first.recordCommand(command());
    first.dispose();

    const reopenedStore = new DexieRecoveryRepository(databaseNames[0], { indexedDB, IDBKeyRange });
    const reopened = new EditorRecoverySystem({ repository: reopenedStore });
    const serverV2 = document("Server v2");
    const nextCurrent = { document: serverV2, revision: 1 };
    const candidate = await reopened.startSession(session("store-3", 2, serverV2, nextCurrent));

    expect(candidate?.hasServerConflict).toBe(true);
    const conflicts = await reopened.listUnresolvedConflicts("store-3");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].localDocument).toEqual(document("Local based on v1"));
    expect(conflicts[0].serverDocument).toEqual(serverV2);
    expect(await reopened.resolveConflict(conflicts[0].id, "keep-local"))
      .toEqual(document("Local based on v1"));
    expect((await reopenedStore.getDraft("store-3"))?.baseServerRevision).toBe(2);
    reopened.dispose();
  });

  it("does not clear an edit that lands while an older document is being acknowledged", async () => {
    const store = repository();
    const current = { document: document("Server"), revision: 1 };
    const recovery = new EditorRecoverySystem({ repository: store });
    await recovery.startSession(session("store-4", 1, current.document, current));

    const firstDocument = document("First edit");
    current.document = firstDocument;
    current.revision = 2;
    const firstWrite = recovery.recordCommand(command("command-first"));
    current.document = document("Newer edit");
    current.revision = 3;
    const secondWrite = recovery.recordCommand(command("command-second"));
    const markedCurrent = recovery.markSaved(2, firstDocument);

    await Promise.all([firstWrite, secondWrite]);
    expect(await markedCurrent).toBe(false);
    expect((await store.getDraft("store-4"))?.document).toEqual(document("Newer edit"));
    expect((await store.getMetadata("store-4"))?.dirty).toBe(true);
    recovery.dispose();
  });

  it("batches rapid commands into one document capture and one current draft", async () => {
    const store = repository();
    const current = { document: document("Server"), revision: 1 };
    let captures = 0;
    const recovery = new EditorRecoverySystem({
      repository: store,
      commandBatchDelayMs: 0,
    });
    await recovery.startSession({
      ...session("store-batch", 1, current.document, current),
      getCurrentDocument: () => {
        captures += 1;
        return { document: current.document, localRevision: current.revision };
      },
    });

    current.document = document("Latest edit");
    current.revision = 3;
    await Promise.all([
      recovery.recordCommand(command("command-a")),
      recovery.recordCommand(command("command-b")),
    ]);

    expect(captures).toBe(1);
    expect(await store.listCommands("store-batch")).toHaveLength(2);
    expect((await store.getDraft("store-batch"))?.document).toEqual(document("Latest edit"));
    recovery.dispose();
  });

  it("persists migration backups and reports independently of the live session", async () => {
    const store = repository();
    const recovery = new EditorRecoverySystem({ repository: store });
    await recovery.captureMigration("store-5", {
      backup: { engine_scene: { version: 1 } },
      document: { engine_document_version: 2, engine_scene: { version: 2 } },
      report: {
        id: "migration-report-1",
        sourceVersion: 1,
        targetVersion: 2,
        status: "succeeded",
        startedAt: "2026-08-01T00:00:00.000Z",
        completedAt: "2026-08-01T00:00:01.000Z",
        steps: [],
      },
    });

    expect(await store.listMigrations("store-5")).toEqual([
      expect.objectContaining({
        id: "migration-report-1",
        backup: { engine_scene: { version: 1 } },
      }),
    ]);
    expect(await store.listSnapshots("store-5")).toEqual([
      expect.objectContaining({ kind: "migration-backup" }),
    ]);
    recovery.dispose();
  });
});
