import { createContext } from "react";
import type { EngineKernel } from "./EngineKernel";

export const EngineReactContext = createContext<EngineKernel | null>(null);
