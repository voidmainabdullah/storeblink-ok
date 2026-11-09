import { describe, expect, it } from "vitest";
import {
  PLATFORM_COMPILED_THEME_IDS,
  assertPlatformCompiledThemeId,
} from "./platformTrust";

describe("platform compiled theme trust", () => {
  it("uses an explicit source allowlist and never promotes an arbitrary package", () => {
    expect(PLATFORM_COMPILED_THEME_IDS).toEqual([
      "basic", "atelier", "noir-chrono", "spark-fashion",
    ]);
    expect(() => assertPlatformCompiledThemeId("basic")).not.toThrow();
    expect(() => assertPlatformCompiledThemeId("marketplace-upload"))
      .toThrow(/does not confer platform trust/);
  });
});
