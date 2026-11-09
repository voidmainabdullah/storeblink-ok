import type { RuntimeArtifact } from "@/adaptive-commerce/contracts";
import { compareShadowArtifacts, projectRuntimeArtifact } from "./StructuralArtifactDiff";

const HASH = `sha256:${"a".repeat(64)}`;
const ref = (id: string) => ({ id, version: "1.0.0", integrity: HASH });
const route = (resourceType: keyof RuntimeArtifact["routes"]) => ({
  resourceType,
  blueprint: ref(resourceType === "404" ? "not-found" : resourceType),
  document: { sections: ["header", resourceType, "footer"], layout: "stack", a11y: true },
});
const artifact = (createdAt = "2026-08-21T00:00:00.000Z"): RuntimeArtifact => ({
  kind: "runtime-artifact",
  artifactVersion: 1,
  id: "artifact-1",
  storeId: "store-1",
  installationId: "installation-1",
  storeKit: ref("store-kit"),
  schemaVersion: 1,
  compilerVersion: "1.0.0",
  sourceHash: HASH,
  artifactHash: HASH,
  createdAt,
  routes: {
    home: route("home"), product: route("product"), collection: route("collection"),
    page: route("page"), blog: route("blog"), cart: route("cart"),
    search: route("search"), "404": route("404"),
  },
  globals: { header: true },
  resolvedTokens: { "semantic:color.background": "#fff" },
  componentVersions: { hero: "1.0.0" },
  bindingPlans: [],
  assets: [],
  diagnostics: [],
  extensions: {},
});

describe("StructuralArtifactDiff", () => {
  it("ignores artifact identity and timestamp metadata", () => {
    const current = artifact();
    const next = { ...artifact("2030-01-01T00:00:00.000Z"), id: "artifact-2", artifactHash: `sha256:${"b".repeat(64)}` };
    expect(compareShadowArtifacts({ projection: projectRuntimeArtifact(current), uncomparableRoutes: [] }, next).status)
      .toBe("equal");
  });

  it("detects layout, behavior, accessibility, and order changes", () => {
    const current = artifact();
    const next = artifact();
    next.routes.product.document = {
      sections: ["footer", "product", "header"],
      layout: "grid",
      behavior: "sticky-buy",
      a11y: false,
    };
    const result = compareShadowArtifacts({ projection: projectRuntimeArtifact(current), uncomparableRoutes: [] }, next);
    expect(result.status).toBe("different");
    expect(result.changes.some((change) => change.kind === "reordered")).toBe(true);
    expect(result.changes.some((change) => change.path.endsWith("layout"))).toBe(true);
    expect(result.changes.some((change) => change.path.endsWith("a11y"))).toBe(true);
  });

  it("marks opaque legacy routes uncomparable instead of reporting a false zero diff", () => {
    const current = artifact();
    const result = compareShadowArtifacts({
      projection: projectRuntimeArtifact(current),
      uncomparableRoutes: ["product"],
      reason: "Legacy product page is an opaque React branch.",
    }, current);
    expect(result).toMatchObject({
      status: "uncomparable",
      uncomparableRoutes: ["product"],
      changes: [],
    });
  });
});

