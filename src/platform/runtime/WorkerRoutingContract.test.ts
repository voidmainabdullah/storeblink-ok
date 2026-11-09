import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type WranglerConfig = {
  account_id?: string;
  workers_dev?: boolean;
  routes?: Array<{ pattern?: string; zone_name?: string }>;
  assets?: { not_found_handling?: string };
};

describe("production Worker routing contract", () => {
  it("routes the complete SaaS zone through the host-aware storefront Worker", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf8"),
    ) as WranglerConfig;

    expect(config.account_id).toBe("6f5438dfd233062d3f5fabdc86c9b592");
    expect(config.workers_dev).toBe(false);
    expect(config.routes).toContainEqual({
      pattern: "*/*",
      zone_name: "storeblink.com",
    });
    expect(config.assets?.not_found_handling).toBe("single-page-application");
  });
});
