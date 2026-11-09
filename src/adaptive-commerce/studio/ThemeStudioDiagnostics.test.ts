import { describe, expect, it, vi } from "vitest";
import { STOREFRONT_COMPILER_STAGES } from "@/adaptive-commerce/compiler";
import { STOREFRONT_RESOURCE_TYPES } from "@/adaptive-commerce/contracts";
import { RESPONSIVE_PRIMITIVE_KINDS } from "@/adaptive-commerce/responsive";
import { loadThemeStudioDiagnostics } from "./ThemeStudioDiagnostics";

describe("ThemeStudioDiagnostics", () => {
  it("reports the real registered catalog and deterministic compiler coverage", async () => {
    const resolve = vi.fn().mockResolvedValue({ runtime: "legacy", reason: "missing" });
    const report = await loadThemeStudioDiagnostics({
      storeHandle: "demo-store",
      dependencies: { runtimeResolver: { resolve } },
    });

    expect(resolve).toHaveBeenCalledWith("demo-store");
    expect(report.status).not.toBe("blocked");
    expect(report.installable).toBe(true);
    expect(report.compiler.status).toBe("compiled");
    expect(report.compiler.completedStages).toEqual(STOREFRONT_COMPILER_STAGES);
    expect(report.routeCoverage.map((route) => route.resourceType)).toEqual(STOREFRONT_RESOURCE_TYPES);
    expect(report.routeCoverage.every((route) => route.compiled && route.blueprintId !== "unregistered"))
      .toBe(true);
    expect(report.packages.map((entry) => entry.kind)).toEqual([
      "store-kit",
      "design-pack",
      "component-library",
    ]);
    expect(report.tokens.total).toBe(
      report.tokens.primitive + report.tokens.semantic + report.tokens.component,
    );
    expect(report.primitiveKinds).toEqual(RESPONSIVE_PRIMITIVE_KINDS);
    expect(report.currentRuntime.status).toBe("missing");
    expect(Object.isFrozen(report.routeCoverage)).toBe(true);
    expect(Object.isFrozen(report.compiler)).toBe(true);
  });

  it("reports a compiler failure as blocked and never marks routes compiled", async () => {
    const report = await loadThemeStudioDiagnostics({
      dependencies: {
        compile: () => { throw new Error("Compiler worker is offline"); },
        runtimeResolver: { resolve: vi.fn() },
      },
    });
    expect(report.status).toBe("blocked");
    expect(report.compiler.status).toBe("failed");
    expect(report.routeCoverage.every((route) => !route.compiled)).toBe(true);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      severity: "error",
      message: "Compiler worker is offline",
    }));
    expect(report.currentRuntime.status).toBe("not-checked");
  });

  it("keeps a runtime outage separate from catalog certification", async () => {
    const report = await loadThemeStudioDiagnostics({
      storeHandle: "demo-store",
      dependencies: {
        runtimeResolver: { resolve: async () => { throw new Error("network unavailable"); } },
      },
    });
    expect(report.compiler.status).toBe("compiled");
    expect(report.currentRuntime.status).toBe("unavailable");
    expect(report.status).not.toBe("blocked");
  });
});
