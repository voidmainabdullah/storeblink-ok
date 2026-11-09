import type { SupabaseClient } from "@supabase/supabase-js";
import { DetailedError, Upload } from "tus-js-client";
import type { Database } from "@/integrations/supabase/types";
import type { AssetBucket, AssetUploadProgress } from "./types";
import { AssetPlatformError, mapAssetError } from "./asset.errors";

const RESUMABLE_THRESHOLD_BYTES = 6 * 1024 * 1024;
const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

export type PreparedAssetUpload = Readonly<{
  id: string;
  storeId: string;
  bucket: AssetBucket;
  path: string;
  status: "pending" | "uploaded";
}>;

export type AssetTransferInput = Readonly<{
  prepared: PreparedAssetUpload;
  file: File;
  contentType: string;
  signal?: AbortSignal;
  onProgress?: (progress: AssetUploadProgress) => void;
}>;

const progress = (
  input: AssetTransferInput,
  bytesUploaded: number,
): AssetUploadProgress => ({
  assetId: input.prepared.id,
  bytesUploaded,
  bytesTotal: input.file.size,
  percentage: input.file.size ? Math.round((bytesUploaded / input.file.size) * 100) : 0,
  phase: "uploading",
});

export class AssetUploadService {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly projectUrl: string,
    private readonly publishableKey: string,
  ) {}

  async upload(input: AssetTransferInput): Promise<void> {
    if (input.signal?.aborted) throw new DOMException("Upload cancelled", "AbortError");
    // Supabase's standard upload API does not expose an abort signal. Route any
    // explicitly cancellable transfer through TUS, even below the size limit.
    if (input.file.size > RESUMABLE_THRESHOLD_BYTES || input.signal) {
      await this.uploadResumable(input);
      return;
    }
    input.onProgress?.(progress(input, 0));
    const result = await this.client.storage.from(input.prepared.bucket).upload(
      input.prepared.path,
      input.file,
      {
        cacheControl: input.prepared.bucket === "storefront-assets" ? "31536000" : "3600",
        contentType: input.contentType,
        upsert: false,
      },
    );
    if (result.error) throw mapAssetError(result.error);
    input.onProgress?.(progress(input, input.file.size));
  }

  private async uploadResumable(input: AssetTransferInput): Promise<void> {
    const session = await this.client.auth.getSession();
    if (session.error || !session.data.session?.access_token) {
      throw new AssetPlatformError("ASSET_PERMISSION_DENIED", { cause: session.error });
    }
    const projectRef = new URL(this.projectUrl).hostname.split(".")[0];
    const endpoint = `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let cancel: (() => void) | null = null;
      const cleanup = () => {
        if (cancel) input.signal?.removeEventListener("abort", cancel);
      };
      const upload = new Upload(input.file, {
        endpoint,
        uploadSize: input.file.size,
        chunkSize: TUS_CHUNK_BYTES,
        retryDelays: [0, 1000, 3000, 5000, 10_000],
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: input.prepared.bucket,
          objectName: input.prepared.path,
          contentType: input.contentType,
          cacheControl: input.prepared.bucket === "storefront-assets" ? "31536000" : "3600",
        },
        headers: {
          authorization: `Bearer ${session.data.session.access_token}`,
          apikey: this.publishableKey,
          "x-upsert": "false",
        },
        onProgress: (sent) => input.onProgress?.(progress(input, sent)),
        onError: (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          const status = error instanceof DetailedError
            ? error.originalResponse?.getStatus()
            : undefined;
          reject(status === 409
            ? new AssetPlatformError("ASSET_STORAGE_CONFLICT", { cause: error, status })
            : mapAssetError(error));
        },
        onSuccess: () => {
          if (settled) return;
          settled = true;
          cleanup();
          input.onProgress?.(progress(input, input.file.size));
          resolve();
        },
      });

      cancel = () => {
        if (settled) return;
        settled = true;
        cleanup();
        void upload.abort(false).finally(() => reject(new DOMException("Upload cancelled", "AbortError")));
      };
      if (input.signal?.aborted) {
        cancel();
        return;
      }
      input.signal?.addEventListener("abort", cancel, { once: true });

      void upload.findPreviousUploads()
        .then((previous) => {
          if (settled) return;
          const matching = previous.find((candidate) =>
            candidate.metadata?.bucketName === input.prepared.bucket
            && candidate.metadata?.objectName === input.prepared.path,
          );
          if (matching) upload.resumeFromPreviousUpload(matching);
          upload.start();
        })
        .catch((error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(mapAssetError(error));
        });
    });
  }
}
