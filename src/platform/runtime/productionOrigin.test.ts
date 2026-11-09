import { describe, expect, it } from "vitest";
import { PRODUCTION_ORIGIN, productionUrl } from "./productionOrigin";

describe("production origin", () => {
  it("always creates auth links on the canonical StoreBlink host", () => {
    expect(PRODUCTION_ORIGIN).toBe("https://storeblink.com");
    expect(productionUrl("/auth/callback?returnTo=%2Fdashboard")).toBe(
      "https://storeblink.com/auth/callback?returnTo=%2Fdashboard",
    );
  });
});
