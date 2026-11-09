import type { SitemapEntry } from "../types";

export const xmlEscape = (value: string): string => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

export const renderUrlSet = (entries: readonly SitemapEntry[]): string => {
  const hasAlternates = entries.some((entry) => entry.alternates.length > 0);
  const namespace = hasAlternates
    ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"'
    : "";
  const rows = entries.map((entry) => {
    const alternates = entry.alternates.map((alternate) =>
      `    <xhtml:link rel="alternate" hreflang="${xmlEscape(alternate.locale)}" href="${xmlEscape(alternate.url)}" />`,
    );
    return [
      "  <url>",
      `    <loc>${xmlEscape(entry.location)}</loc>`,
      `    <lastmod>${xmlEscape(entry.lastModified)}</lastmod>`,
      ...alternates,
      "  </url>",
    ].join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${namespace}>`,
    ...rows,
    "</urlset>",
    "",
  ].join("\n");
};

export const renderSitemapIndex = (
  segments: readonly Readonly<{ publicUrl: string; lastModified: string }>[],
): string => [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...segments.map((segment) => [
    "  <sitemap>",
    `    <loc>${xmlEscape(segment.publicUrl)}</loc>`,
    `    <lastmod>${xmlEscape(segment.lastModified)}</lastmod>`,
    "  </sitemap>",
  ].join("\n")),
  "</sitemapindex>",
  "",
].join("\n");
