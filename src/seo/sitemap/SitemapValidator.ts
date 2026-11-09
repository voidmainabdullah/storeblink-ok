import { XMLValidator } from "fast-xml-parser";
import {
  HARD_SITEMAP_BYTE_LIMIT,
  HARD_SITEMAP_URL_LIMIT,
  INTERNAL_SITEMAP_URL_LIMIT,
} from "./SitemapCompiler";
import type {
  CompiledSitemapGeneration,
  SitemapValidationIssue,
  SitemapValidationResult,
} from "../types";

const encoder = new TextEncoder();

const xmlValidationMessage = (xml: string): string | null => {
  const validation = XMLValidator.validate(xml);
  if (validation === true) return null;
  const error = validation.err;
  return `${error.msg} (line ${error.line}, column ${error.col})`;
};

export class SitemapValidator {
  validate(generation: CompiledSitemapGeneration): SitemapValidationResult {
    const issues: SitemapValidationIssue[] = [];
    const locations = new Set<string>();
    const childUrls = new Set(generation.segments.map((segment) => segment.publicUrl));
    const indexBytes = encoder.encode(generation.sitemapXml).byteLength;
    if (!generation.sitemapXml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
      issues.push({ code: "INVALID_XML_DECLARATION", message: "Sitemap index must declare UTF-8." });
    }
    const sitemapIndexXmlError = xmlValidationMessage(generation.sitemapXml);
    if (sitemapIndexXmlError) {
      issues.push({ code: "INVALID_XML", message: `Sitemap index XML is invalid: ${sitemapIndexXmlError}` });
    }
    if (indexBytes > HARD_SITEMAP_BYTE_LIMIT) {
      issues.push({ code: "INDEX_TOO_LARGE", message: "Sitemap index exceeds 50 MB." });
    }
    for (const childUrl of childUrls) {
      if (!generation.sitemapXml.includes(`<loc>${childUrl.replace(/&/g, "&amp;")}</loc>`)) {
        issues.push({ code: "BROKEN_CHILD_REFERENCE", message: `Missing child reference ${childUrl}.` });
      }
    }
    for (const segment of generation.segments) {
      const segmentXmlError = xmlValidationMessage(segment.xml);
      if (segmentXmlError) {
        issues.push({
          code: "INVALID_XML",
          message: `Sitemap segment XML is invalid: ${segmentXmlError}`,
          fileName: segment.fileName,
        });
      }
      if (segment.urlCount > INTERNAL_SITEMAP_URL_LIMIT || segment.urlCount > HARD_SITEMAP_URL_LIMIT) {
        issues.push({ code: "TOO_MANY_URLS", message: "Segment exceeds URL limits.", fileName: segment.fileName });
      }
      if (segment.uncompressedBytes > HARD_SITEMAP_BYTE_LIMIT) {
        issues.push({ code: "SEGMENT_TOO_LARGE", message: "Segment exceeds 50 MB.", fileName: segment.fileName });
      }
      if (segment.urlCount !== segment.entries.length) {
        issues.push({ code: "COUNT_MISMATCH", message: "Segment URL count does not match entries.", fileName: segment.fileName });
      }
      for (const entry of segment.entries) {
        let parsed: URL;
        try {
          parsed = new URL(entry.location);
        } catch {
          issues.push({ code: "INVALID_URL", message: `Invalid URL ${entry.location}.`, fileName: segment.fileName });
          continue;
        }
        if (parsed.protocol !== "https:" || !entry.location.startsWith(generation.canonicalOrigin)) {
          issues.push({ code: "WRONG_DOMAIN", message: `URL is outside the primary origin: ${entry.location}.`, fileName: segment.fileName });
        }
        if (locations.has(entry.location)) {
          issues.push({ code: "DUPLICATE_URL", message: `Duplicate URL ${entry.location}.`, fileName: segment.fileName });
        }
        locations.add(entry.location);
        if (!Number.isFinite(Date.parse(entry.lastModified))) {
          issues.push({ code: "INVALID_LASTMOD", message: `Invalid lastmod for ${entry.location}.`, fileName: segment.fileName });
        }
      }
    }
    if (locations.size !== generation.urlCount) {
      issues.push({ code: "GENERATION_COUNT_MISMATCH", message: "Generation URL count does not match its segments." });
    }
    return { valid: issues.length === 0, issues };
  }
}

export const sitemapValidator = new SitemapValidator();
