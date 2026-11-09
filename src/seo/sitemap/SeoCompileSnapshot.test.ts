import { describe, expect, it } from "vitest";
import { parseSeoCompileSnapshot } from "./SeoCompileSnapshot";

const validSnapshot = {
  store: {
    id: "6f0a443c-6eb4-4a0f-891b-bd4e1bf5804d",
    name: "Example store",
    handle: "example",
    status: "published",
    primaryHostname: "example.com",
    canonicalOrigin: "https://example.com",
  },
  resources: [],
  activeGenerationId: null,
  dirtyVersion: 7,
  indexNow: null,
};

describe("parseSeoCompileSnapshot", () => {
  it("preserves the dirty version used for generation activation", () => {
    expect(parseSeoCompileSnapshot(validSnapshot).dirtyVersion).toBe(7);
  });

  it.each([undefined, -1, 1.5, Number.NaN])(
    "rejects invalid dirty version %s",
    (dirtyVersion) => {
      expect(() => parseSeoCompileSnapshot({ ...validSnapshot, dirtyVersion }))
        .toThrow("Invalid sitemap snapshot dirty version.");
    },
  );
});
