import { sha256, sitemapCompiler } from "./SitemapCompiler";
import { sitemapValidator } from "./SitemapValidator";
import type {
  CompiledSitemapGeneration,
  SeoCompileSnapshot,
  SitemapValidationIssue,
} from "../types";

export interface SitemapArtifactStore {
  put(input: Readonly<{
    key: string;
    body: string;
    contentType: "application/xml; charset=utf-8" | "text/plain; charset=utf-8";
    contentHash: string;
  }>): Promise<void>;
}

export interface SitemapGenerationGateway {
  activate(input: Readonly<{
    generationId: string;
    generation: CompiledSitemapGeneration;
  }>): Promise<void>;
  fail(input: Readonly<{
    generationId: string;
    code: string;
    message: string;
    validationIssues: readonly SitemapValidationIssue[];
  }>): Promise<void>;
}

export class SitemapGenerationService {
  async compileValidateAndActivate(input: Readonly<{
    generationId: string;
    snapshot: SeoCompileSnapshot;
    storagePrefix: string;
    indexNowKey?: string;
    artifacts: SitemapArtifactStore;
    gateway: SitemapGenerationGateway;
  }>): Promise<CompiledSitemapGeneration> {
    let validationIssues: readonly SitemapValidationIssue[] = [];
    try {
      const generation = await sitemapCompiler.compile(input.snapshot, {
        storagePrefix: input.storagePrefix,
      });
      const validation = sitemapValidator.validate(generation);
      validationIssues = validation.issues;
      if (!validation.valid) {
        throw new Error(`Sitemap validation failed with ${validation.issues.length} issue(s).`);
      }
      await Promise.all([
        input.artifacts.put({
          key: generation.sitemapObjectKey,
          body: generation.sitemapXml,
          contentType: "application/xml; charset=utf-8",
          contentHash: generation.contentHash,
        }),
        ...generation.segments.map((segment) => input.artifacts.put({
          key: segment.objectKey,
          body: segment.xml,
          contentType: "application/xml; charset=utf-8" as const,
          contentHash: segment.contentHash,
        })),
        ...(input.indexNowKey ? [input.artifacts.put({
          key: `${generation.storagePrefix}/indexnow-key.txt`,
          body: input.indexNowKey,
          contentType: "text/plain; charset=utf-8" as const,
          contentHash: await sha256(input.indexNowKey),
        })] : []),
      ]);
      await input.gateway.activate({ generationId: input.generationId, generation });
      return generation;
    } catch (error) {
      try {
        await input.gateway.fail({
          generationId: input.generationId,
          code: validationIssues.length > 0 ? "SITEMAP_VALIDATION_FAILED" : "SITEMAP_COMPILE_FAILED",
          message: error instanceof Error ? error.message : "Sitemap compilation failed.",
          validationIssues,
        });
      } catch (reportingError) {
        console.error("Sitemap generation failure could not be persisted.", reportingError);
      }
      throw error;
    }
  }
}

export const sitemapGenerationService = new SitemapGenerationService();
