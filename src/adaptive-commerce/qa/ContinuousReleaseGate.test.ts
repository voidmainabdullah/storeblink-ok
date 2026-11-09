import type { RuntimeArtifact } from "@/adaptive-commerce/contracts";
import { readFileSync } from "node:fs";
import {
  ADAPTIVE_QA_FIXTURES,
  adaptiveQaWidths,
  runContinuousAdaptiveQa,
} from "./index";

const HASH = `sha256:${"a".repeat(64)}`;
const ref = (id: string) => ({ id, version: "1.0.0", integrity: HASH });
const resourceTypes = ["home", "product", "collection", "page", "blog", "cart", "search", "404"] as const;
const artifact: RuntimeArtifact = {
  kind: "runtime-artifact", artifactVersion: 1, id: "artifact-1", storeId: "store-1",
  installationId: "install-1", storeKit: ref("store-kit"), schemaVersion: 1,
  compilerVersion: "1.0.0", sourceHash: HASH, artifactHash: HASH,
  createdAt: "2026-08-21T00:00:00.000Z",
  routes: Object.fromEntries(resourceTypes.map((resourceType) => [resourceType, {
    resourceType,
    blueprint: ref(resourceType === "404" ? "not-found" : resourceType),
    document: {},
  }])) as RuntimeArtifact["routes"],
  globals: {}, resolvedTokens: {}, componentVersions: {}, bindingPlans: [], assets: [],
  diagnostics: [], extensions: {},
};

describe("ContinuousReleaseGate", () => {
  it("keeps the structural gate and actual adaptive browser spec in one hard command", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    const command = packageJson.scripts["verify:v3-release"];
    expect(command).toContain("vite-node scripts/verify-adaptive-commerce-v3.mjs");
    expect(command).toContain("&& playwright test tests/e2e/adaptive-commerce-storefront.spec.ts");
    expect(command).toContain("--config=playwright.adaptive-release.config.ts");
    const browserConfig = readFileSync("playwright.adaptive-release.config.ts", "utf8");
    expect(browserConfig).toContain("reuseExistingServer: false");
    expect(browserConfig).toContain("--strictPort");
  });

  it("enumerates every integer width from 320 through 2560", () => {
    const widths = adaptiveQaWidths();
    expect(widths[0]).toBe(320);
    expect(widths.at(-1)).toBe(2560);
    expect(widths).toHaveLength(2241);
    expect(widths.every((width, index) => index === 0 || width === widths[index - 1] + 1)).toBe(true);
  });

  it("covers every adversarial boundary in a deterministic compact fixture set", () => {
    expect(new Set(ADAPTIVE_QA_FIXTURES.map((fixture) => fixture.productCount))).toEqual(new Set([1, 500]));
    expect(new Set(ADAPTIVE_QA_FIXTURES.map((fixture) => fixture.media))).toEqual(
      new Set(["missing", "portrait", "landscape", "ultrawide"]),
    );
    expect(ADAPTIVE_QA_FIXTURES.some((fixture) => fixture.locale === "de" && fixture.titleLength === "huge")).toBe(true);
    expect(ADAPTIVE_QA_FIXTURES.some((fixture) => fixture.locale === "ar" && fixture.direction === "rtl")).toBe(true);
    expect(new Set(ADAPTIVE_QA_FIXTURES.map((fixture) => fixture.navigationItems))).toEqual(new Set([3, 18]));
  });

  it("fails on any algorithmic blocker and preserves exact evidence", async () => {
    const report = await runContinuousAdaptiveQa({
      artifacts: [artifact],
      fixtures: [ADAPTIVE_QA_FIXTURES[0]],
      widthStep: 1120,
      probe: ({ resourceType, width }) => resourceType === "cart" && width === 2560
        ? [{ code: "qa.control.unreachable", severity: "blocker", message: "Checkout control is unreachable." }]
        : [],
    });
    expect(report.passed).toBe(false);
    expect(report.checkedRoutes).toBe(8);
    expect(report.checkedWidths).toBe(3);
    expect(report.probeCount).toBe(24);
    expect(report.findings).toEqual([expect.objectContaining({
      code: "qa.control.unreachable",
      resourceType: "cart",
      width: 2560,
    })]);
  });
});
