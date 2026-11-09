import {
  STOREFRONT_COMPILER_STAGES,
  StorefrontCompilationError,
  compilerError,
  type StorefrontCompilerStage,
} from "./diagnostics";

export type StorefrontCompilerStageRunner<TContext> = Readonly<{
  id: StorefrontCompilerStage;
  run(context: TContext): TContext;
}>;

export type CompilerPipelineResult<TContext> = Readonly<{
  context: TContext;
  completedStages: readonly StorefrontCompilerStage[];
}>;

const assertExactPipeline = <TContext>(
  stages: readonly StorefrontCompilerStageRunner<TContext>[],
): void => {
  if (stages.length !== STOREFRONT_COMPILER_STAGES.length) {
    throw new Error(
      `Storefront compiler requires ${STOREFRONT_COMPILER_STAGES.length} ordered stages; received ${stages.length}.`,
    );
  }
  STOREFRONT_COMPILER_STAGES.forEach((expected, index) => {
    const actual = stages[index]?.id;
    if (actual !== expected) {
      throw new Error(
        `Storefront compiler stage ${index + 1} must be ${expected}; received ${String(actual)}.`,
      );
    }
  });
};

/** Runs the complete publish-time pipeline in its architecture-defined order. */
export const runStorefrontCompilerPipeline = <TContext>(
  initialContext: TContext,
  stages: readonly StorefrontCompilerStageRunner<TContext>[],
): CompilerPipelineResult<TContext> => {
  assertExactPipeline(stages);
  const completedStages: StorefrontCompilerStage[] = [];
  let context = initialContext;
  for (const stage of stages) {
    try {
      context = stage.run(context);
      completedStages.push(stage.id);
    } catch (cause) {
      if (cause instanceof StorefrontCompilationError) throw cause;
      throw new StorefrontCompilationError([
        compilerError(
          stage.id,
          "compiler.stage.failed",
          `${stage.id} failed: ${cause instanceof Error ? cause.message : "unknown compiler error"}`,
        ),
      ]);
    }
  }
  return { context, completedStages };
};

