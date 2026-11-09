import { describe, expect, it } from "vitest";
import { MetaTagValidator } from "./MetaTagValidator";

describe("MetaTagValidator", () => {
  const validator = new MetaTagValidator();

  it("normalizes allow-listed tags", () => {
    expect(validator.sanitize([
      { attribute: "name", key: " Keywords ", content: " watches " },
      { attribute: "property", key: "product:brand", content: "StoreBlink" },
    ])).toEqual([
      { attribute: "name", key: "keywords", content: "watches" },
      { attribute: "property", key: "product:brand", content: "StoreBlink" },
    ]);
  });

  it.each([
    { attribute: "name", key: "robots", content: "noindex" },
    { attribute: "name", key: "google-site-verification", content: "stolen" },
    { attribute: "name", key: "http-equiv", content: "refresh" },
    { attribute: "property", key: "og:title", content: "override" },
  ] as const)("blocks reserved or unsafe tag $key", (tag) => {
    expect(() => validator.sanitize([tag])).toThrow(/not allowed|allow-listed/);
  });

  it("accepts HTTPS hreflang values and rejects script protocols", () => {
    expect(validator.sanitizeAlternates([
      { locale: "en-PK", url: "https://shop.example.com/en" },
    ])).toHaveLength(1);
    expect(() => validator.sanitizeAlternates([
      { locale: "en", url: "javascript:alert(1)" },
    ])).toThrow("Invalid hreflang alternate");
  });
});
