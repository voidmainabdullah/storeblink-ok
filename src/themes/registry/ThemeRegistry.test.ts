import { describe, expect, it } from "vitest";
import { builtInThemeRegistry, ThemeRegistry } from "./ThemeRegistry";

describe("ThemeRegistry", () => {
  it("resolves only features declared by the active theme and capability", () => {
    expect(builtInThemeRegistry.resolveFeature("atelier", "product-quick-view"))
      .toMatchObject({ sourceThemeId: "atelier" });
    expect(builtInThemeRegistry.resolveFeature("basic", "product-quick-view")).toBeNull();
  });

  it("returns defensive manifest copies", () => {
    const first = builtInThemeRegistry.get("basic");
    if (!first) throw new Error("Basic theme missing");
    first.name = "Changed";
    expect(builtInThemeRegistry.get("basic")?.name).toBe("Basic Store");
  });

  it("rejects conflicting in-process versions", () => {
    const registry = new ThemeRegistry();
    const manifest = builtInThemeRegistry.get("basic");
    if (!manifest) throw new Error("Basic theme missing");
    registry.register(manifest);
    expect(() => registry.register({ ...manifest, version: "2.0.0" })).toThrow(
      /migration system/i,
    );
  });

  it("discovers the Atelier package manifest without manual sidebar registration", () => {
    expect(builtInThemeRegistry.get("atelier")).toMatchObject({
      id: "atelier",
      schemaVersion: 1,
      capabilities: {
        productHotspots: true,
        editorialTypography: true,
      },
    });
  });

  it("rejects duplicate ids even when the version is identical", () => {
    const registry = new ThemeRegistry();
    const manifest = builtInThemeRegistry.get("atelier");
    if (!manifest) throw new Error("Atelier theme missing");
    registry.register(manifest);
    expect(() => registry.register(manifest)).toThrow(/already registered/i);
  });
});
