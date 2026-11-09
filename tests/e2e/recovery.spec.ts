import { expect, test } from "@playwright/test";

test("validated draft survives a real browser reload", async ({ page }) => {
  const databaseName = `storeblink-browser-recovery-${Date.now()}`;
  await page.route("**/__phase3-recovery-probe", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><head><meta charset=\"utf-8\"></head><body>Recovery probe</body></html>",
    });
  });
  await page.goto("/__phase3-recovery-probe");

  const firstSession = await page.evaluate(async (name) => {
    const recoveryModule = await (new Function(
      "return import('/src/persistence/recovery/index.ts')",
    )() as Promise<typeof import("../../src/persistence/recovery")>);
    const repository = new recoveryModule.DexieRecoveryRepository(name);
    const recovery = new recoveryModule.EditorRecoverySystem({ repository });
    const serverDocument = {
      engine_document_version: 2,
      engine_scene: { rootNodeId: null, nodes: {} },
    };
    const current = { document: serverDocument as unknown, revision: 1 };
    const session = {
      storeId: "browser-store",
      serverRevision: 7,
      serverDocument,
      getCurrentDocument: () => ({
        document: current.document,
        localRevision: current.revision,
      }),
      validateDocument: (document: unknown) => ({
        valid: Boolean(document && typeof document === "object" && "engine_scene" in document),
        issues: [] as string[],
      }),
      getDocumentVersion: (document: unknown) =>
        Number((document as { engine_document_version?: number }).engine_document_version ?? 1),
    };
    await recovery.startSession(session);
    current.document = {
      engine_document_version: 2,
      engine_scene: { rootNodeId: null, nodes: {}, marker: "unsaved-browser-edit" },
    };
    current.revision = 2;
    await recovery.recordCommand({
      id: "browser-command",
      type: "browser.update",
      label: "Browser recovery edit",
      timestamp: Date.now(),
      payload: { marker: "unsaved-browser-edit" },
      execute: () => undefined,
      undo: () => undefined,
    });
    const draft = await repository.getDraft("browser-store");
    recovery.dispose();
    return { stored: Boolean(draft), checksum: draft?.checksum ?? null };
  }, databaseName);

  expect(firstSession.stored).toBe(true);
  await page.reload();

  const reopened = await page.evaluate(async (name) => {
    const recoveryModule = await (new Function(
      "return import('/src/persistence/recovery/index.ts')",
    )() as Promise<typeof import("../../src/persistence/recovery")>);
    const repository = new recoveryModule.DexieRecoveryRepository(name);
    const recovery = new recoveryModule.EditorRecoverySystem({ repository });
    const serverDocument = {
      engine_document_version: 2,
      engine_scene: { rootNodeId: null, nodes: {} },
    };
    const current = { document: serverDocument as unknown, revision: 1 };
    const candidate = await recovery.startSession({
      storeId: "browser-store",
      serverRevision: 7,
      serverDocument,
      getCurrentDocument: () => ({ document: current.document, localRevision: current.revision }),
      validateDocument: (document: unknown) => ({
        valid: Boolean(document && typeof document === "object" && "engine_scene" in document),
        issues: [] as string[],
      }),
      getDocumentVersion: (document: unknown) =>
        Number((document as { engine_document_version?: number }).engine_document_version ?? 1),
    });
    const restored = candidate ? await recovery.restoreCandidate(candidate) : null;
    recovery.dispose();
    const cleanup = new recoveryModule.DexieRecoveryRepository(name);
    await cleanup.deleteDatabase();
    return {
      found: Boolean(candidate),
      commandCount: candidate?.commandCount ?? 0,
      restored,
    };
  }, databaseName);

  expect(reopened.found).toBe(true);
  expect(reopened.commandCount).toBe(1);
  expect(reopened.restored).toMatchObject({
    engine_scene: { marker: "unsaved-browser-edit" },
  });
});
