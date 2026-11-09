import {
  assertCustomCodeSource,
  CUSTOM_CODE_OUTPUT_LIMIT,
  CUSTOM_CODE_RUNTIME_VERSION,
  hashCustomCode,
  type CustomCodeLanguage,
  type CustomCodeProps,
} from "./CustomCodeContract";

type SucraseModule = typeof import("sucrase");

let compilerPromise: Promise<SucraseModule> | null = null;

const loadCompiler = (): Promise<SucraseModule> => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The custom-code compiler is available in the visual editor only."));
  }
  if (!compilerPromise) {
    compilerPromise = import("sucrase");
  }
  return compilerPromise;
};

export const compileCustomCode = async (
  source: string,
  css: string,
  current?: Pick<CustomCodeProps, "data" | "title" | "language">,
  language: CustomCodeLanguage = current?.language ?? "tsx",
): Promise<CustomCodeProps> => {
  assertCustomCodeSource(source, css);
  const compiler = await loadCompiler();
  const result = compiler.transform(source, {
    transforms: language === "tsx" ? ["typescript", "jsx"] : ["jsx"],
    jsxRuntime: "classic",
    jsxPragma: "React.createElement",
    jsxFragmentPragma: "React.Fragment",
    production: true,
    filePath: language === "tsx" ? "StoreBlinkCustomSection.tsx" : "StoreBlinkCustomSection.jsx",
  });
  if (result.code.length > CUSTOM_CODE_OUTPUT_LIMIT) {
    throw new Error("Compiled output is too large for a storefront section.");
  }
  return {
    language,
    source,
    css,
    compiledJs: result.code,
    sourceHash: hashCustomCode(source, css),
    runtimeVersion: CUSTOM_CODE_RUNTIME_VERSION,
    data: current?.data ?? {},
    title: current?.title ?? "Custom React section",
  };
};
