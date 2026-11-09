# Asset System

## Purpose

Provide one store-scoped pipeline for validating, uploading, resolving, and
persisting immutable media references without storing binary data in Scene
Graph documents.

## Owns

- Type/size validation, SVG sanitization, dimensions, and content hashes.
- Standard and TUS resumable browser-to-Storage transfers.
- Upload progress, cancellation, retry/resume, conflict handling, and cleanup.
- Asset metadata prepare/finalize/retire lifecycle.
- Public CDN URLs, private signed-URL caching, and responsive `srcset` presets.
- The root `extensions.assetLibrary` storage-reference manifest.

## Does NOT Own

- Logo placement or theme styling.
- Scene node mutations outside an executing Command.
- Inspector UI state.
- Authentication state or store membership policy.
- Binary proxying through the application server or Edge Functions.
- Persistent RLS/storage policy ownership.

## Public API

```ts
interface AssetSystemAPI {
  getLibrary(scene: SceneTree): SceneAssetLibrary;
  getImage(scene: SceneTree, assetId: string | null | undefined): ImageAssetRecord | null;
  upsertImage(scene: SceneTree, asset: ImageAssetRecord): SceneTree;
  removeImage(scene: SceneTree, assetId: string): SceneTree;
}

interface AssetManagerAPI {
  setStoreContext(storeId: string | null): void;
  uploadImage(input: UploadImageInput): Promise<AssetUploadResult>;
  replaceImage(previousAssetId: string, input: UploadImageInput): Promise<AssetUploadResult>;
}
```

## Depends On

- Scene Graph clone API and Command System callers.
- The lazy browser Supabase client.
- `prepare_asset_upload`, `finalize_asset_upload`, `fail_asset_upload`, and
  `retire_asset` secure RPCs.
- Supabase Storage and `tus-js-client`.
- Zod validation and shared SVG sanitization.

## Folder

`src/assets/system/`

## State Ownership

The serialized asset-reference library is owned by the Scene Graph root.
`AssetManager` owns transfer orchestration but no React state. Supabase Storage
owns bytes and `public.assets` owns durable metadata. Feature UI commits the
returned reference through Command System.

## Event Flow

File input -> `AssetManager` validation/sanitization/hash -> prepare RPC ->
direct standard/TUS upload -> finalize RPC -> URL resolver/cache ->
`ImageAssetRecord` -> Command -> History/Scene Graph -> Renderer -> autosave.

Replacement creates a new immutable asset first and retires the old metadata
only after success. Retryable failures stay pending for resume; terminal errors
and explicit cancellation clean up the object and metadata state.

## Performance Notes

Raster dimensions, SVG parsing, and SHA-256 hashing happen once per transfer.
Files above 6 MiB, plus any transfer with an abort signal, use TUS. Public
assets use immutable CDN URLs and 96/320/640/960/1440/1920 presets. Private
signed URLs are cached until shortly before expiry. Renderers consume metadata
without reading original files.

## Known Pitfalls / Anti-Patterns

- Never store raw SVG markup before sanitization.
- Never read files directly inside feature inspectors.
- Never persist base64/blob bytes or a second asset copy in consuming nodes.
- Never let retry cleanup delete an object shared by an identical concurrent
  resumable upload.
- Never overwrite mutable content at the same object path.
- Public reads do not imply public writes; storage path checks must match a
  prepared metadata row and active capability.

## Extensibility

Additional media kinds can reuse the prepare/transfer/finalize contract.
External providers can implement the same immutable metadata and URL resolver
interfaces without changing Scene Graph node contracts.
