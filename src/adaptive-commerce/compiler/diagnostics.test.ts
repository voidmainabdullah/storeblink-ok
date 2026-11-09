import { describe, expect, it } from "vitest";
import {
  STOREFRONT_COMPILER_STAGES,
  StorefrontCompilationError,
  compilerError,
  compilerWarning,
  throwForCompilerErrors,
} from "./diagnostics";
import { cloneAndFreeze } from "./immutable";

describe("storefront compiler diagnostics", () => {
  it("keeps the publish-time stage order explicit", () => {
    expect(STOREFRONT_COMPILER_STAGES).toEqual([
      "schema-validation",
      "migration",
      "token-resolution",
      "template-resolution",
      "slot-resolution",
      "commerce-binding",
      "layout-resolution",
      "responsive-compilation",
      "accessibility-validation",
      "asset-optimization",
      "performance-validation",
    ]);
  });

  it("fails closed on errors but retains advisory warnings", () => {
    const warning = compilerWarning("performance-validation", "large-route", "Large route");
    expect(() => throwForCompilerErrors([warning])).not.toThrow();
    const failure = compilerError("accessibility-validation", "missing-alt", "Alt text required");
    expect(() => throwForCompilerErrors([warning, failure])).toThrow(StorefrontCompilationError);
  });

  it("clones and deeply freezes immutable compiler output", () => {
    const source = { route: { sections: [{ type: "hero" }] } };
    const frozen = cloneAndFreeze(source);
    source.route.sections[0].type = "changed";
    expect(frozen.route.sections[0].type).toBe("hero");
    expect(Object.isFrozen(frozen.route.sections)).toBe(true);
    expect(Object.isFrozen(frozen.route.sections[0])).toBe(true);
  });
});
