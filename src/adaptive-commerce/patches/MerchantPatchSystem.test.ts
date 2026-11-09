import { describe, expect, it } from "vitest";
import {
  semanticPath,
  type SemanticPath,
  type SemanticStorefrontDocument,
} from "@/adaptive-commerce/contracts";
import {
  HASH_C,
  createBaseDocument,
  createPatch,
} from "@/adaptive-commerce/testing/fixtures";
import { MerchantPatchError, MerchantPatchSystem } from "./MerchantPatchSystem";

const path = (value: string): SemanticPath => value as SemanticPath;

describe("MerchantPatchSystem", () => {
  const system = new MerchantPatchSystem();

  it("applies scalar and keyed collection operations deterministically", () => {
    const base = createBaseDocument();
    const result = system.apply(base, [createPatch([
      { op: "set", target: path("home.hero.heading"), value: "Merchant heading" },
      { op: "insert", target: path("home.featured.items"), key: "d", value: "Delta", beforeKey: "b" },
      { op: "reorder", target: path("home.featured.items"), key: "c", beforeKey: "a" },
      { op: "remove", target: path("home.featured.items"), key: "b" },
    ])]);
    expect(result.document.values["home.hero.heading"]).toBe("Merchant heading");
    expect(result.document.collections["home.featured.items"].order).toEqual(["c", "a", "d"]);
    expect(result.document.collections["home.featured.items"].items).toEqual({
      a: "Alpha", c: "Gamma", d: "Delta",
    });
    expect(result.appliedOperationCount).toBe(4);
    expect(base.values["home.hero.heading"]).toBe("Original heading");
  });

  it("renames both the semantic base and patch targets without id fallback", () => {
    const result = system.apply(createBaseDocument(), [createPatch([
      { op: "set", target: path("home.hero.heading"), value: "Renamed heading" },
    ])], [{ from: path("home.hero"), to: path("home.masthead") }]);
    expect(result.document.values["home.masthead.heading"]).toBe("Renamed heading");
    expect(result.document.values["home.hero.heading"]).toBeUndefined();
  });

  it("rejects rename cycles and an unknown patch base revision", () => {
    expect(() => system.apply(createBaseDocument(), [createPatch([
      { op: "set", target: path("home.hero.heading"), value: "X" },
    ])], [
      { from: path("home.hero"), to: path("home.masthead") },
      { from: path("home.masthead"), to: path("home.hero") },
    ])).toThrow(MerchantPatchError);
    expect(() => system.apply(createBaseDocument(), [createPatch([
      { op: "set", target: path("home.hero.heading"), value: "X" },
    ], { baseRevisionId: "different-base" })])).toThrow(/different-base/);
  });

  it("performs a conservative three-way merge and never applies conflicts", () => {
    const oldBase = createBaseDocument();
    const newBase: SemanticStorefrontDocument = structuredClone(oldBase);
    newBase.revisionId = "base-v2";
    newBase.baseHash = HASH_C;
    newBase.values["home.hero.heading"] = "New kit heading";
    const result = system.mergeBases(oldBase, newBase, [createPatch([
      { op: "set", target: path("home.hero.heading"), value: "Merchant heading" },
      { op: "set", target: path("home.hero.body"), value: "Merchant body" },
    ])]);
    expect(result.status).toBe("conflicted");
    expect(result.publishable).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      target: "home.hero.heading",
      reason: "path-changed",
      status: "unresolved",
    });
    expect(result.candidate.values["home.hero.heading"]).toBe("New kit heading");
    expect(result.candidate.values["home.hero.body"]).toBe("Merchant body");
  });

  it("detects keyed item and reorder conflicts independently", () => {
    const oldBase = createBaseDocument();
    const newBase: SemanticStorefrontDocument = structuredClone(oldBase);
    newBase.revisionId = "base-v2";
    newBase.baseHash = HASH_C;
    newBase.collections["home.featured.items"].items.a = "Alpha from kit";
    newBase.collections["home.featured.items"].order = ["c", "a", "b"];
    const conflicts = system.detectConflicts(oldBase, newBase, [createPatch([
      { op: "remove", target: path("home.featured.items"), key: "a" },
      { op: "reorder", target: path("home.featured.items"), key: "c", beforeKey: "b" },
    ])]);
    expect(conflicts.map((conflict) => conflict.reason)).toEqual([
      "collection-item-changed",
      "collection-order-changed",
    ]);
  });

  it("remaps non-conflicting merchant edits across an explicit base rename", () => {
    const oldBase = createBaseDocument();
    const newBase: SemanticStorefrontDocument = structuredClone(oldBase);
    newBase.revisionId = "base-v2";
    newBase.baseHash = HASH_C;
    newBase.values = {
      [semanticPath("home.masthead.heading")]: "Original heading",
      [semanticPath("home.masthead.body")]: "Original body",
    };
    const result = system.mergeBases(oldBase, newBase, [createPatch([
      { op: "set", target: path("home.hero.heading"), value: "Merchant heading" },
    ])], [{ from: path("home.hero"), to: path("home.masthead") }]);
    expect(result.status).toBe("merged");
    expect(result.publishable).toBe(true);
    expect(result.candidate.values["home.masthead.heading"]).toBe("Merchant heading");
  });
});
