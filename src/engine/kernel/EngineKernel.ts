import { createEngineEventBus, type EngineEventBus, type EngineEventMap } from "@/engine/event-bus";
import type {
  EngineContext,
  EngineSystem,
  EngineSystemLifecycle,
  RegisteredSystem,
} from "./types";

const lifecycleFor = (system: EngineSystem): EngineSystemLifecycle =>
  system as EngineSystemLifecycle;

export class EngineKernel {
  private readonly systems = new Map<string, RegisteredSystem>();
  private readonly order: string[] = [];
  private readonly bus: EngineEventBus<EngineEventMap>;
  private readonly context: EngineContext;

  constructor(eventBus: EngineEventBus<EngineEventMap> = createEngineEventBus()) {
    this.bus = eventBus;
    this.context = Object.freeze({
      eventBus: this.bus,
      resolveSystem: <TSystem>(key: string) => this.resolve<TSystem>(key),
      tryResolveSystem: <TSystem>(key: string) => this.tryResolve<TSystem>(key),
      hasSystem: (key: string) => this.has(key),
      listSystems: () => this.list(),
    });
  }

  register<TSystem extends EngineSystem>(key: string, system: TSystem): TSystem {
    if (this.systems.has(key)) throw new Error(`Engine system ${key} is already registered.`);
    this.systems.set(key, { key, system, initialized: false });
    this.order.push(key);
    return system;
  }

  unregister(key: string): void {
    const registered = this.systems.get(key);
    if (!registered) return;
    if (registered.initialized) throw new Error(`Cannot unregister initialized system ${key}. Dispose the kernel first.`);
    this.systems.delete(key);
    const index = this.order.indexOf(key);
    if (index >= 0) this.order.splice(index, 1);
  }

  resolve<TSystem>(key: string): TSystem {
    const registered = this.systems.get(key);
    if (!registered) throw new Error(`Engine system ${key} is not registered.`);
    return registered.system as TSystem;
  }

  tryResolve<TSystem>(key: string): TSystem | undefined {
    return this.systems.get(key)?.system as TSystem | undefined;
  }

  has(key: string): boolean {
    return this.systems.has(key);
  }

  list(): string[] {
    return [...this.order];
  }

  getContext(): EngineContext {
    return this.context;
  }

  getEventBus(): EngineEventBus<EngineEventMap> {
    return this.bus;
  }

  async init(): Promise<void> {
    for (const key of this.order) {
      const registered = this.systems.get(key);
      if (!registered || registered.initialized) continue;
      await lifecycleFor(registered.system).init?.(this.context);
      registered.initialized = true;
    }
  }

  async dispose(): Promise<void> {
    for (const key of [...this.order].reverse()) {
      const registered = this.systems.get(key);
      if (!registered?.initialized) continue;
      await lifecycleFor(registered.system).dispose?.();
      registered.initialized = false;
    }
  }
}

export const createEngineKernel = () => new EngineKernel();
