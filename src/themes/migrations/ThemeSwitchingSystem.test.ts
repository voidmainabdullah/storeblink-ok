import { describe, expect, it } from "vitest";
import { builtInThemeRegistry } from "@/themes/registry";
import { ThemeSwitchingSystem } from "./ThemeSwitchingSystem";

describe("ThemeSwitchingSystem", () => {
  it("archives the current installation and preserves portable store settings", () => {
    const atelier = builtInThemeRegistry.get("atelier");
    if (!atelier) throw new Error("Atelier theme missing");
    const system = new ThemeSwitchingSystem();
    const plan = system.prepare({
      current: {
        id: "old-install",
        storeId: "store-1",
        themeId: "basic",
        themeVersion: "1.0.0",
        schemaVersion: 1,
        status: "active",
        globalSettings: { primaryColor: "#123456", logoId: "logo-1" },
        featureSettings: { oldFeature: true },
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
      targetManifest: atelier,
      sourceSectionTypes: ["header", "product-grid", "unsupported-widget"],
      nextInstallationId: "new-install",
      now: "2026-07-28",
    });

    expect(plan.previousInstallation).toMatchObject({ id: "old-install", status: "archived" });
    expect(plan.nextInstallation).toMatchObject({
      id: "new-install",
      themeId: "atelier",
      status: "draft",
      globalSettings: { primaryColor: "#123456", logoId: "logo-1" },
    });
    expect(plan.mappings).toContainEqual({
      sourceSectionType: "unsupported-widget",
      targetSectionType: "unsupported-widget",
    });
    expect(plan.unsupportedSectionTypes).toEqual([]);
  });
});
