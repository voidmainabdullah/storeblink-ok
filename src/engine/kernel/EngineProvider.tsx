import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { EngineKernel, createEngineKernel } from "./EngineKernel";
import { EngineReactContext } from "./EngineReactContext";

export type EngineProviderProps = PropsWithChildren<{
  kernel?: EngineKernel;
}>;

export const EngineProvider = ({ kernel, children }: EngineProviderProps) => {
  const stableKernel = useMemo(() => kernel ?? createEngineKernel(), [kernel]);
  const [initializationError, setInitializationError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    void stableKernel.init().catch((error: unknown) => {
      if (active) setInitializationError(error);
    });
    return () => {
      active = false;
      void stableKernel.dispose();
    };
  }, [stableKernel]);
  if (initializationError) throw initializationError;
  return <EngineReactContext.Provider value={stableKernel}>{children}</EngineReactContext.Provider>;
};
