import {
  canonicalUrlForRoute,
  parseSeoCompileSnapshot,
  sitemapGenerationService,
  sha256,
  type CompiledSitemapGeneration,
  type SeoCompileSnapshot,
  type SitemapArtifactStore,
  type SitemapGenerationGateway,
  type SitemapValidationIssue,
} from "../src/seo";

export type R2ObjectLike = {
  body: ReadableStream;
  text?(): Promise<string>;
  httpEtag?: string;
  httpMetadata?: { contentType?: string };
};

export type R2BucketLike = {
  get(key: string): Promise<R2ObjectLike | null>;
  put(
    key: string,
    value: string,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown>;
  delete?(key: string): Promise<void>;
};

export type KVNamespaceLike = {
  get(key: string, type?: "text"): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

export type SeoRuntimeEnv = {
  SEO_ARTIFACTS?: R2BucketLike;
  SEO_HOSTS?: KVNamespaceLike;
  SEO_ORCHESTRATOR_ENDPOINT?: string;
  DOMAIN_CRON_SECRET?: string;
};

export type SeoRouteManifest = Readonly<{
  version: 1;
  storeId: string;
  storeHandle: string;
  generationId: string;
  canonicalOrigin: string;
  hostname: string;
  files: Readonly<Record<string, string>>;
  indexNowKeyPath?: string;
  activatedAt: string;
}>;

type CompilerClaim = Readonly<{
  storeId: string;
  generationId: string;
  storagePrefix: string;
  snapshot: unknown;
}>;

type ActivationSegment = Readonly<{
  type: string;
  number: number;
  objectKey: string;
  urlCount: number;
  uncompressedBytes: number;
  contentHash: string;
  lastModified: string;
}>;

type RollbackPreparation = Readonly<{
  storeId: string;
  storeHandle: string;
  generationId: string;
  canonicalOrigin: string;
  hostname: string;
  files: Readonly<Record<string, string>>;
  indexNowKeyPath?: string;
}>;

export type OverdueSitemapIncident = Readonly<{
  storeId: string;
  dirtySince: string;
  dirtyVersion: number;
  dirtySegments: readonly string[];
  ageHours: number;
  lastCompiledAt: string | null;
  lastFailureAt: string | null;
  lastFailureCode: string | null;
  lastFailureMessage: string | null;
}>;

const requireBindings = (env: SeoRuntimeEnv) => {
  if (!env.SEO_ARTIFACTS) {
    throw new Error("SEO R2 artifact storage is not configured.");
  }
  return { artifacts: env.SEO_ARTIFACTS };
};

const compilerEndpoint = (env: SeoRuntimeEnv): URL => {
  if (!env.SEO_ORCHESTRATOR_ENDPOINT || !env.DOMAIN_CRON_SECRET) {
    throw new Error("SEO compiler orchestration is not configured.");
  }
  const endpoint = new URL(env.SEO_ORCHESTRATOR_ENDPOINT);
  if (endpoint.protocol !== "https:" || !endpoint.hostname.endsWith(".supabase.co")) {
    throw new Error("SEO orchestrator must be a Supabase HTTPS endpoint.");
  }
  return endpoint;
};

const orchestratorAction = async <T>(
  env: SeoRuntimeEnv,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> => {
  const response = await fetch(compilerEndpoint(env), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-storeblink-cron-secret": env.DOMAIN_CRON_SECRET!,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await response.json().catch(() => null) as {
    data?: T;
    error?: { code?: string; message?: string };
  } | null;
  if (!response.ok || body?.data === undefined) {
    throw new Error(body?.error?.message || `SEO orchestrator returned HTTP ${response.status}.`);
  }
  return body.data;
};

class R2SitemapArtifactStore implements SitemapArtifactStore {
  constructor(private readonly bucket: R2BucketLike) {}

  async put(input: Parameters<SitemapArtifactStore["put"]>[0]): Promise<void> {
    await this.bucket.put(input.key, input.body, {
      httpMetadata: {
        contentType: input.contentType,
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: { sha256: input.contentHash },
    });
  }
}

type RouteManifestStore = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

const routeObjectKey = (key: string): string =>
  `routes/${encodeURIComponent(key)}.json`;

const readR2Text = async (object: R2ObjectLike): Promise<string> =>
  object.text ? object.text() : new Response(object.body).text();

const routeManifestStore = (env: SeoRuntimeEnv): RouteManifestStore => {
  if (env.SEO_HOSTS) {
    return {
      get: (key) => env.SEO_HOSTS!.get(key, "text"),
      put: (key, value) => env.SEO_HOSTS!.put(key, value),
      delete: (key) => env.SEO_HOSTS!.delete(key),
    };
  }
  if (!env.SEO_ARTIFACTS) throw new Error("SEO route manifest storage is not configured.");
  return {
    async get(key) {
      const object = await env.SEO_ARTIFACTS!.get(routeObjectKey(key));
      return object ? readR2Text(object) : null;
    },
    async put(key, value) {
      await env.SEO_ARTIFACTS!.put(routeObjectKey(key), value, {
        httpMetadata: {
          contentType: "application/json; charset=utf-8",
          cacheControl: "no-cache",
        },
      });
    },
    async delete(key) {
      if (!env.SEO_ARTIFACTS!.delete) {
        throw new Error("The R2 binding does not support route manifest deletion.");
      }
      await env.SEO_ARTIFACTS!.delete(routeObjectKey(key));
    },
  };
};

const manifestForGeneration = (
  snapshot: SeoCompileSnapshot,
  generationId: string,
  generation: CompiledSitemapGeneration,
): SeoRouteManifest => ({
  version: 1,
  storeId: snapshot.store.id,
  storeHandle: snapshot.store.handle,
  generationId,
  canonicalOrigin: generation.canonicalOrigin,
  hostname: generation.hostname,
  files: Object.fromEntries([
    ["/sitemap.xml", generation.sitemapObjectKey],
    ...generation.segments.map((segment) => [`/${segment.fileName}`, segment.objectKey]),
    ...(snapshot.indexNow?.enabled
      ? [[snapshot.indexNow.keyLocationPath, `${generation.storagePrefix}/indexnow-key.txt`]]
      : []),
  ]),
  ...(snapshot.indexNow?.enabled ? { indexNowKeyPath: snapshot.indexNow.keyLocationPath } : {}),
  activatedAt: new Date().toISOString(),
});

const manifestRouteKeys = (manifest: SeoRouteManifest): string[] => {
  const keys = [`store:${manifest.storeHandle}`];
  if (manifest.hostname !== "storeblink.com") keys.push(`host:${manifest.hostname}`);
  return keys;
};

const switchRouteManifest = async (
  manifests: RouteManifestStore,
  next: SeoRouteManifest,
  commit: () => Promise<void>,
): Promise<void> => {
  const writeKeys = manifestRouteKeys(next);
  const previousStoreManifest = await manifests.get(`store:${next.storeHandle}`);
  let previousHostname: string | null = null;
  if (previousStoreManifest) {
    try {
      const previous = JSON.parse(previousStoreManifest) as Partial<SeoRouteManifest>;
      previousHostname = typeof previous.hostname === "string" ? previous.hostname : null;
    } catch {
      previousHostname = null;
    }
  }
  const obsoleteKeys = previousHostname &&
      previousHostname !== "storeblink.com" &&
      previousHostname !== next.hostname
    ? [`host:${previousHostname}`]
    : [];
  const touchedKeys = Array.from(new Set([...writeKeys, ...obsoleteKeys]));
  const previous = await Promise.all(touchedKeys.map((key) => manifests.get(key)));
  const serialized = JSON.stringify(next);
  await Promise.all([
    ...writeKeys.map((key) => manifests.put(key, serialized)),
    ...obsoleteKeys.map((key) => manifests.delete(key)),
  ]);
  try {
    await commit();
  } catch (error) {
    await Promise.all(touchedKeys.map((key, index) => {
      const old = previous[index];
      return old === null ? manifests.delete(key) : manifests.put(key, old);
    }));
    throw error;
  }
};

class OrchestratedGenerationGateway implements SitemapGenerationGateway {
  constructor(
    private readonly env: SeoRuntimeEnv,
    private readonly snapshot: SeoCompileSnapshot,
    private readonly manifests: RouteManifestStore,
  ) {}

  async activate(input: Readonly<{ generationId: string; generation: CompiledSitemapGeneration }>): Promise<void> {
    const manifest = manifestForGeneration(this.snapshot, input.generationId, input.generation);
    const segments: ActivationSegment[] = input.generation.segments.map((segment) => ({
      type: segment.type,
      number: segment.number,
      objectKey: segment.objectKey,
      urlCount: segment.urlCount,
      uncompressedBytes: segment.uncompressedBytes,
      contentHash: segment.contentHash,
      lastModified: segment.lastModified,
    }));
    await switchRouteManifest(this.manifests, manifest, async () => {
      await orchestratorAction(this.env, "seo-compiler-activate", {
        generationId: input.generationId,
        segments,
        urlCount: input.generation.urlCount,
        contentHash: input.generation.contentHash,
      });
    });
  }

  async fail(input: Readonly<{
    generationId: string;
    code: string;
    message: string;
    validationIssues: readonly SitemapValidationIssue[];
  }>): Promise<void> {
    await orchestratorAction(this.env, "seo-compiler-fail", {
      generationId: input.generationId,
      code: input.code,
      message: input.message,
      validationErrors: input.validationIssues,
    });
  }
}

const submitIndexNow = async (
  env: SeoRuntimeEnv,
  snapshot: SeoCompileSnapshot,
  generationId: string,
  urls: readonly string[],
): Promise<void> => {
  if (!snapshot.indexNow?.enabled || urls.length === 0) return;
  const keyLocation = `${snapshot.store.canonicalOrigin}${snapshot.indexNow.keyLocationPath}`;
  for (let offset = 0; offset < urls.length; offset += 10_000) {
    const batch = urls.slice(offset, offset + 10_000);
    let status: "submitted" | "failed" = "submitted";
    let failureMessage: string | null = null;
    try {
      const response = await fetch("https://api.indexnow.org/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host: snapshot.store.primaryHostname,
          key: snapshot.indexNow.key,
          keyLocation,
          urlList: batch,
        }),
      });
      if (!response.ok && response.status !== 202) {
        throw new Error(`IndexNow returned HTTP ${response.status}.`);
      }
    } catch (error) {
      status = "failed";
      failureMessage = error instanceof Error ? error.message : "IndexNow submission failed.";
    }
    await orchestratorAction(env, "seo-indexnow-result", {
      storeId: snapshot.store.id,
      generationId,
      hostname: snapshot.store.primaryHostname,
      urls: batch,
      status,
      failureMessage,
    }).catch((error) => console.error("IndexNow result could not be persisted.", error));
  }
};

const indexNowUrlsForGeneration = (
  snapshot: SeoCompileSnapshot,
  generation: CompiledSitemapGeneration,
): readonly string[] => {
  if (!snapshot.indexNow || snapshot.indexNow.fullRefresh) return generation.eligibleUrls;
  const changedKeys = new Set(snapshot.indexNow.resourceKeys);
  const urls = snapshot.resources.flatMap((resource) => {
    const key = `${resource.resourceType}:${resource.resourceId}`;
    if (!changedKeys.has(key)) return [];
    try {
      return [canonicalUrlForRoute(snapshot.store.canonicalOrigin, resource.route)];
    } catch {
      return [];
    }
  });
  return Array.from(new Set(urls));
};

export const compileClaimedSitemaps = async (
  env: SeoRuntimeEnv,
  limit = 2,
): Promise<Readonly<{ claimed: number; completed: number; failed: number }>> => {
  const bindings = requireBindings(env);
  const manifests = routeManifestStore(env);
  const claims = await orchestratorAction<CompilerClaim[]>(env, "seo-compiler-claim", { limit });
  let completed = 0;
  let failed = 0;
  for (const claim of claims) {
    let generationServiceStarted = false;
    try {
      const snapshot = parseSeoCompileSnapshot(claim.snapshot);
      generationServiceStarted = true;
      const generation = await sitemapGenerationService.compileValidateAndActivate({
        generationId: claim.generationId,
        snapshot,
        storagePrefix: claim.storagePrefix,
        indexNowKey: snapshot.indexNow?.enabled ? snapshot.indexNow.key : undefined,
        artifacts: new R2SitemapArtifactStore(bindings.artifacts),
        gateway: new OrchestratedGenerationGateway(env, snapshot, manifests),
      });
      completed += 1;
      await submitIndexNow(
        env,
        snapshot,
        claim.generationId,
        indexNowUrlsForGeneration(snapshot, generation),
      );
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Unknown sitemap compiler error";
      if (!generationServiceStarted) {
        await orchestratorAction(env, "seo-compiler-fail", {
          generationId: claim.generationId,
          code: "SITEMAP_SNAPSHOT_INVALID",
          message,
          validationErrors: [],
        }).catch((persistenceError) => {
          console.error("Sitemap failure state could not be persisted", {
            storeId: claim.storeId,
            message: persistenceError instanceof Error
              ? persistenceError.message
              : "Unknown persistence error",
          });
        });
      }
      console.error("Sitemap generation failed", {
        storeId: claim.storeId,
        message,
      });
    }
  }
  return { claimed: claims.length, completed, failed };
};

export const reportOverdueSitemaps = async (
  env: SeoRuntimeEnv,
): Promise<readonly OverdueSitemapIncident[]> =>
  orchestratorAction<OverdueSitemapIncident[]>(env, "seo-health-check");

export const rollbackCompiledSitemap = async (
  env: SeoRuntimeEnv,
  storeId: string,
  generationId: string,
): Promise<SeoRouteManifest> => {
  requireBindings(env);
  const preparation = await orchestratorAction<RollbackPreparation>(
    env,
    "seo-compiler-rollback-prepare",
    { storeId, generationId },
  );
  const manifest: SeoRouteManifest = {
    version: 1,
    storeId: preparation.storeId,
    storeHandle: preparation.storeHandle,
    generationId: preparation.generationId,
    canonicalOrigin: preparation.canonicalOrigin,
    hostname: preparation.hostname,
    files: preparation.files,
    ...(preparation.indexNowKeyPath
      ? { indexNowKeyPath: preparation.indexNowKeyPath }
      : {}),
    activatedAt: new Date().toISOString(),
  };
  const artifactKeys = Array.from(new Set(Object.values(manifest.files)));
  const artifactChecks = await Promise.all(
    artifactKeys.map((key) => env.SEO_ARTIFACTS!.get(key)),
  );
  const missingIndex = artifactChecks.findIndex((artifact) => artifact === null);
  if (missingIndex >= 0) {
    throw new Error(`Rollback artifact is missing: ${artifactKeys[missingIndex]}`);
  }
  await switchRouteManifest(routeManifestStore(env), manifest, async () => {
    await orchestratorAction(env, "seo-compiler-rollback-commit", {
      storeId,
      generationId,
    });
  });
  return manifest;
};

export const loadSeoRouteManifest = async (
  env: SeoRuntimeEnv,
  key: string,
): Promise<SeoRouteManifest | null> => {
  if (!env.SEO_HOSTS && !env.SEO_ARTIFACTS) return null;
  const raw = await routeManifestStore(env).get(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as SeoRouteManifest;
    return value?.version === 1 && typeof value.files === "object" ? value : null;
  } catch {
    return null;
  }
};

export const serveCompiledSeoArtifact = async (
  request: Request,
  env: SeoRuntimeEnv,
  manifest: SeoRouteManifest,
  filePath: string,
): Promise<Response | null> => {
  if (!env.SEO_ARTIFACTS) return null;
  if (filePath === "/robots.txt") {
    const body = [
      "User-agent: *",
      "Allow: /",
      "Disallow: /checkout",
      "Disallow: /account",
      "Disallow: /admin",
      "Disallow: /preview",
      `Sitemap: ${manifest.canonicalOrigin}/sitemap.xml`,
      "",
    ].join("\n");
    return new Response(request.method === "HEAD" ? null : body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  const objectKey = manifest.files[filePath];
  if (!objectKey) return null;
  const object = await env.SEO_ARTIFACTS.get(objectKey);
  if (!object) return null;
  const isIndex = filePath === "/sitemap.xml";
  const contentType = filePath.endsWith(".txt")
    ? "text/plain; charset=utf-8"
    : "application/xml; charset=utf-8";
  return new Response(request.method === "HEAD" ? null : object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? contentType,
      "Cache-Control": isIndex
        ? "public, max-age=60, s-maxage=300, stale-while-revalidate=3600"
        : "public, max-age=31536000, immutable",
      ...(object.httpEtag ? { ETag: object.httpEtag } : {}),
      "X-Content-Type-Options": "nosniff",
      "X-StoreBlink-Sitemap-Generation": manifest.generationId,
    },
  });
};

export const isSeoFilePath = (path: string): boolean =>
  path === "/robots.txt" || path === "/sitemap.xml" ||
  /^\/[a-f0-9]{32}\.txt$/.test(path) ||
  /^\/sitemap_(?:pages|products|collections|blogs)_\d+\.xml$/.test(path);

export const seoManifestEtag = sha256;
