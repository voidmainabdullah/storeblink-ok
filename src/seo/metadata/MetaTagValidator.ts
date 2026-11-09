import type { SafeMetaTag, SeoAlternate } from "../types";

const allowedNames = new Set([
  "author",
  "keywords",
  "application-name",
  "theme-color",
  "color-scheme",
]);
const reservedKeys = new Set([
  "viewport",
  "charset",
  "robots",
  "description",
  "google-site-verification",
  "og:title",
  "og:description",
  "og:url",
  "og:image",
  "twitter:title",
  "twitter:description",
  "twitter:image",
  "twitter:card",
]);
const propertyPattern = /^(?:product|article|profile):[a-z0-9:_-]+$/;
const localePattern = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export class MetaTagValidator {
  sanitize(tags: readonly SafeMetaTag[]): SafeMetaTag[] {
    if (tags.length > 20) throw new Error("A maximum of 20 custom meta tags is allowed.");
    return tags.map((tag) => {
      const key = tag.key.trim().toLowerCase();
      const content = tag.content.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
      if (!content || content.length > 500 || reservedKeys.has(key)) {
        throw new Error(`Custom meta tag ${key || "(empty)"} is not allowed.`);
      }
      if (tag.attribute === "name" && !allowedNames.has(key)) {
        throw new Error(`Meta name ${key} is not allow-listed.`);
      }
      if (tag.attribute === "property" && !propertyPattern.test(key)) {
        throw new Error(`Meta property ${key} is not allow-listed.`);
      }
      return { attribute: tag.attribute, key, content };
    });
  }

  sanitizeAlternates(alternates: readonly SeoAlternate[]): SeoAlternate[] {
    if (alternates.length > 50) throw new Error("A maximum of 50 hreflang alternates is allowed.");
    return alternates.map((alternate) => {
      const locale = alternate.locale.trim();
      const url = new URL(alternate.url);
      if (!localePattern.test(locale) || url.protocol !== "https:" || url.username || url.password || url.hash) {
        throw new Error("Invalid hreflang alternate.");
      }
      return { locale, url: url.toString() };
    });
  }
}

export const metaTagValidator = new MetaTagValidator();
