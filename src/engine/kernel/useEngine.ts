import { useContext } from "react";
import { EngineReactContext } from "./EngineReactContext";
import type { EngineContext } from "./types";
import type { EngineKernel } from "./EngineKernel";

export const useEngine = (): EngineKernel => {
  const kernel = useContext(EngineReactContext);
  if (!kernel) throw new Error("useEngine must be used inside EngineProvider.");
  return kernel;
};

export const useOptionalEngine = (): EngineKernel | null => useContext(EngineReactContext);

export const useEngineContext = (): EngineContext => useEngine().getContext();

export const useOptionalEngineContext = (): EngineContext | null => useOptionalEngine()?.getContext() ?? null;
