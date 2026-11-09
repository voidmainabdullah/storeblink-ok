import type { EngineEventHandler, EngineEventMap } from "./types";

export class EngineEventBus<TEvents extends Record<string, unknown> = EngineEventMap> {
  private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();

  on<K extends keyof TEvents & string>(eventName: K, handler: EngineEventHandler<TEvents[K]>): () => void {
    const listeners = this.listeners.get(eventName) ?? new Set<(payload: unknown) => void>();
    const wrapped = (payload: unknown) => handler(payload as TEvents[K]);
    listeners.add(wrapped);
    this.listeners.set(eventName, listeners);
    return () => this.off(eventName, wrapped);
  }

  once<K extends keyof TEvents & string>(eventName: K, handler: EngineEventHandler<TEvents[K]>): () => void {
    const unsubscribe = this.on(eventName, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  emit<K extends keyof TEvents & string>(eventName: K, payload: TEvents[K]): void {
    const listeners = this.listeners.get(eventName);
    if (!listeners) return;
    for (const handler of [...listeners]) {
      handler(payload);
    }
  }

  off(eventName: keyof TEvents & string, handler: (payload: unknown) => void): void {
    const listeners = this.listeners.get(eventName);
    if (!listeners) return;
    listeners.delete(handler);
    if (listeners.size === 0) this.listeners.delete(eventName);
  }

  listenerCount(eventName?: keyof TEvents & string): number {
    if (eventName) return this.listeners.get(eventName)?.size ?? 0;
    return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }

  clear(eventName?: keyof TEvents & string): void {
    if (eventName) {
      this.listeners.delete(eventName);
      return;
    }
    this.listeners.clear();
  }
}

export const createEngineEventBus = () => new EngineEventBus<EngineEventMap>();
