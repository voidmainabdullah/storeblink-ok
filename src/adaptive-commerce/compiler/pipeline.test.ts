import { describe, expect, it, vi } from "vitest";
import { STOREFRONT_COMPILER_STAGES, StorefrontCompilationError } from "./diagnostics";
import {
  runStorefrontCompilerPipeline,
  type StorefrontCompilerStageRunner,
} from "./pipeline";

describe("storefront compiler pipeline", () => {
  const stages = (): StorefrontCompilerStageRunner<{ trace: string[] }>[] =>
    STOREFRONT_COMPILER_STAGES.map((id) => ({
      id,
      run: vi.fn((context) => ({ trace: [...context.trace, id] })),
    }));

  it("executes every stage exactly once in the declared order", () => {
    const result = runStorefrontCompilerPipeline({ trace: [] }, stages());
    expect(result.completedStages).toEqual(STOREFRONT_COMPILER_STAGES);
    expect(result.context.trace).toEqual(STOREFRONT_COMPILER_STAGES);
  });

  it("rejects reordered or incomplete pipelines before executing them", () => {
    const reordered = stages();
    [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
    expect(() => runStorefrontCompilerPipeline({ trace: [] }, reordered)).toThrow(
      /stage 1 must be schema-validation/,
    );
    expect(() => runStorefrontCompilerPipeline({ trace: [] }, stages().slice(1))).toThrow(
      /requires 11 ordered stages/,
    );
  });

  it("turns an unexpected stage exception into a blocking compiler diagnostic", () => {
    const configured = stages();
    configured[4] = {
      id: "slot-resolution",
      run: () => {
        throw new Error("unknown slot");
      },
    };
    expect(() => runStorefrontCompilerPipeline({ trace: [] }, configured)).toThrow(
      StorefrontCompilationError,
    );
    try {
      runStorefrontCompilerPipeline({ trace: [] }, configured);
    } catch (error) {
      expect((error as StorefrontCompilationError).diagnostics[0]).toMatchObject({
        stage: "slot-resolution",
        code: "compiler.stage.failed",
        severity: "error",
        message: expect.stringMatching(/unknown slot/),
      });
    }
  });
});

