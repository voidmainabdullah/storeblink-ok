import { describe, expect, it, vi } from "vitest";
import { AssetManager } from "./AssetManager";

const STORE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";

const svgFile = () => new File([
  `<svg viewBox="0 0 120 40" onload="alert(1)" xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0h120v40H0z" /></svg>`,
], "logo.svg", { type: "image/svg+xml" });

const readText = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result ?? ""));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(file);
});

const createFixture = (
  preparedStatus: "pending" | "uploaded" = "pending",
  uploadImplementation: (_input: unknown) => Promise<void> = async () => undefined,
) => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc = vi.fn(async function (
    this: { rest?: { available: boolean } },
    name: string,
    args: Record<string, unknown>,
  ) {
    if (!this?.rest?.available) {
      throw new TypeError("Cannot read properties of undefined (reading 'rest')");
    }
    calls.push({ name, args });
    if (name === "prepare_asset_upload") {
      return {
        data: {
          id: ASSET_ID,
          store_id: STORE_ID,
          bucket: "storefront-assets",
          path: `stores/${STORE_ID}/assets/${ASSET_ID}/hash-logo.svg`,
          status: preparedStatus,
        },
        error: null,
      };
    }
    if (name === "finalize_asset_upload") {
      return {
        data: {
          id: ASSET_ID,
          store_id: STORE_ID,
          owner_id: USER_ID,
          bucket: "storefront-assets",
          path: `stores/${STORE_ID}/assets/${ASSET_ID}/hash-logo.svg`,
          kind: "svg",
          mime_type: "image/svg+xml",
          bytes: 101,
          width: 120,
          height: 40,
          aspect_ratio: 3,
          alt_text: "Logo",
          focal_x: 0.5,
          focal_y: 0.5,
          content_hash: "a".repeat(64),
          status: "ready",
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
          deleted_at: null,
        },
        error: null,
      };
    }
    return { data: null, error: null };
  });
  const remove = vi.fn(async () => ({ data: [], error: null }));
  const client = {
    rest: { available: true },
    rpc,
    storage: { from: vi.fn(() => ({ remove })) },
  } as any;
  const uploader = { upload: vi.fn(uploadImplementation) };
  const urlResolver = {
    resolve: vi.fn(async () => "https://cdn.example/logo.svg"),
    srcSet: vi.fn(() => "https://cdn.example/logo.svg?width=320 320w"),
  };
  const manager = new AssetManager(client, {
    projectUrl: "https://project.supabase.co",
    publishableKey: "sb_publishable_test",
    uploader: uploader as any,
    urlResolver: urlResolver as any,
  });
  return { manager, calls, uploader, rpc, remove };
};

describe("AssetManager", () => {
  it("keeps the Supabase client receiver attached while preparing an upload", async () => {
    const fixture = createFixture();

    await expect(fixture.manager.uploadImage({
      file: svgFile(),
      storeId: STORE_ID,
    })).resolves.toMatchObject({ url: "https://cdn.example/logo.svg" });
  });

  it("sanitizes, uploads, finalizes and returns a durable Scene Graph asset", async () => {
    const fixture = createFixture();
    const result = await fixture.manager.uploadImage({
      file: svgFile(),
      storeId: STORE_ID,
      altText: "Logo",
    });

    expect(fixture.calls.map((call) => call.name)).toEqual([
      "prepare_asset_upload",
      "finalize_asset_upload",
    ]);
    const transferred = (fixture.uploader.upload.mock.calls.at(0)?.[0] as { file: File }).file;
    expect(await readText(transferred)).not.toMatch(/script|onload/i);
    expect(result.url).toBe("https://cdn.example/logo.svg");
    expect(result.sceneAsset).toMatchObject({
      id: ASSET_ID,
      storage: {
        bucket: "storefront-assets",
        path: expect.stringContaining(`/assets/${ASSET_ID}/`),
        publicUrl: "https://cdn.example/logo.svg",
      },
    });
    expect(JSON.stringify(result.sceneAsset)).not.toMatch(/data:image|base64/i);
  });

  it("retires the previous immutable asset only after replacement succeeds", async () => {
    const fixture = createFixture();
    await fixture.manager.replaceImage("44444444-4444-4444-8444-444444444444", {
      file: svgFile(),
      storeId: STORE_ID,
    });

    expect(fixture.calls.at(-1)).toEqual({
      name: "retire_asset",
      args: { p_asset_id: "44444444-4444-4444-8444-444444444444" },
    });
  });

  it("finalizes an already transferred resumable object without uploading bytes again", async () => {
    const fixture = createFixture("uploaded");
    await fixture.manager.uploadImage({ file: svgFile(), storeId: STORE_ID });

    expect(fixture.uploader.upload).not.toHaveBeenCalled();
    expect(fixture.calls.map((call) => call.name)).toEqual([
      "prepare_asset_upload",
      "finalize_asset_upload",
    ]);
  });

  it("preserves retryable uploads so a conflict can resume without deleting shared bytes", async () => {
    const conflict = Object.assign(new Error("already exists"), { status: 409 });
    const fixture = createFixture("pending", async () => Promise.reject(conflict));

    await expect(fixture.manager.uploadImage({ file: svgFile(), storeId: STORE_ID }))
      .rejects.toMatchObject({ code: "ASSET_STORAGE_CONFLICT", retryable: true });

    expect(fixture.remove).not.toHaveBeenCalled();
    expect(fixture.calls.map((call) => call.name)).toEqual(["prepare_asset_upload"]);
  });
});
