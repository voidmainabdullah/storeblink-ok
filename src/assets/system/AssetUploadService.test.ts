import { beforeEach, describe, expect, it, vi } from "vitest";

const tusState = vi.hoisted(() => ({
  instances: [] as Array<any>,
  status: 0,
}));

vi.mock("tus-js-client", () => {
  class DetailedError extends Error {
    originalResponse: { getStatus: () => number };
    constructor(status: number) {
      super("TUS upload failed");
      this.originalResponse = { getStatus: () => status };
    }
  }
  class Upload {
    options: any;
    file: File;
    resumeFromPreviousUpload = vi.fn();
    abort = vi.fn(async () => undefined);
    findPreviousUploads = vi.fn(async () => [{
      uploadUrl: "https://resume.example/upload",
      metadata: {
        bucketName: this.options.metadata.bucketName,
        objectName: this.options.metadata.objectName,
      },
    }]);
    constructor(file: File, options: any) {
      this.file = file;
      this.options = options;
      tusState.instances.push(this);
    }
    start() {
      if (tusState.status) {
        this.options.onError(new DetailedError(tusState.status));
        return;
      }
      this.options.onProgress(Math.floor(this.file.size / 2), this.file.size);
      this.options.onSuccess();
    }
  }
  return { DetailedError, Upload };
});

import { AssetUploadService } from "./AssetUploadService";

const STORE_ID = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";

const input = (onProgress = vi.fn()) => ({
  prepared: {
    id: ASSET_ID,
    storeId: STORE_ID,
    bucket: "storefront-assets" as const,
    path: `stores/${STORE_ID}/assets/${ASSET_ID}/hash-photo.webp`,
    status: "pending" as const,
  },
  file: new File([new Uint8Array(6 * 1024 * 1024 + 1)], "photo.webp", { type: "image/webp" }),
  contentType: "image/webp",
  onProgress,
});

const smallInput = (signal?: AbortSignal) => ({
  ...input(),
  file: new File([new Uint8Array(1024)], "photo.webp", { type: "image/webp" }),
  signal,
});

describe("AssetUploadService", () => {
  beforeEach(() => {
    tusState.instances.length = 0;
    tusState.status = 0;
  });

  it("uses direct resumable TUS upload and resumes a previous transfer over 6 MiB", async () => {
    const standardUpload = vi.fn();
    const client = {
      auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "token" } }, error: null })) },
      storage: { from: vi.fn(() => ({ upload: standardUpload })) },
    } as any;
    const onProgress = vi.fn();
    const service = new AssetUploadService(client, "https://project.supabase.co", "sb_publishable_test");

    await service.upload(input(onProgress));

    expect(standardUpload).not.toHaveBeenCalled();
    expect(tusState.instances).toHaveLength(1);
    expect(tusState.instances[0].options.endpoint).toBe(
      "https://project.storage.supabase.co/storage/v1/upload/resumable",
    );
    expect(tusState.instances[0].resumeFromPreviousUpload).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ percentage: 100 }));
  });

  it("maps terminal TUS conflicts to a typed retryable storage conflict", async () => {
    tusState.status = 409;
    const client = {
      auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "token" } }, error: null })) },
      storage: { from: vi.fn() },
    } as any;
    const service = new AssetUploadService(client, "https://project.supabase.co", "sb_publishable_test");

    await expect(service.upload(input())).rejects.toMatchObject({
      code: "ASSET_STORAGE_CONFLICT",
      status: 409,
      retryable: true,
    });
  });

  it("uses standard upload for small non-cancellable files", async () => {
    const standardUpload = vi.fn(async () => ({ data: {}, error: null }));
    const client = {
      auth: { getSession: vi.fn() },
      storage: { from: vi.fn(() => ({ upload: standardUpload })) },
    } as any;
    const service = new AssetUploadService(client, "https://project.supabase.co", "sb_publishable_test");

    await service.upload(smallInput());

    expect(standardUpload).toHaveBeenCalledTimes(1);
    expect(tusState.instances).toHaveLength(0);
  });

  it("uses cancellable TUS for a small file when an abort signal is supplied", async () => {
    const standardUpload = vi.fn();
    const client = {
      auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "token" } }, error: null })) },
      storage: { from: vi.fn(() => ({ upload: standardUpload })) },
    } as any;
    const service = new AssetUploadService(client, "https://project.supabase.co", "sb_publishable_test");

    await service.upload(smallInput(new AbortController().signal));

    expect(standardUpload).not.toHaveBeenCalled();
    expect(tusState.instances).toHaveLength(1);
  });
});
