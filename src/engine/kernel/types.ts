import type { EngineEventBus, EngineEventMap } from "@/engine/event-bus";

export type EngineSystem = object;

export type EngineSystemLifecycle = {
  init?: (context: EngineContext) => void | Promise<void>;
  dispose?: () => void | Promise<void>;
};

export type EngineContext = {
  readonly eventBus: EngineEventBus<EngineEventMap>;
  resolveSystem: <TSystem>(key: string) => TSystem;
  tryResolveSystem: <TSystem>(key: string) => TSystem | undefined;
  hasSystem: (key: string) => boolean;
  listSystems: () => string[];
};

export type RegisteredSystem = {
  key: string;
  system: EngineSystem;
  initialized: boolean;
};
