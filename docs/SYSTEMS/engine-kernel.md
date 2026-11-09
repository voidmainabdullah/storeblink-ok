# Engine Kernel

## Purpose

Creates and owns one isolated editor runtime, wires system dependencies, and controls system initialization and disposal.

## Owns

- The system registry and typed system keys.
- One private event bus and one private editor store bundle per kernel.
- System lifecycle order for `init()` and reverse-order `dispose()`.

## Does NOT Own

- Scene node semantics or document mutations.
- React presentation state.
- Compatibility singleton lifetimes outside the active editor runtime.

## Public API

```ts
interface EngineKernelAPI {
  register<T>(key: string, system: T): T;
  unregister(key: string): void;
  resolve<T>(key: string): T;
  tryResolve<T>(key: string): T | undefined;
  has(key: string): boolean;
  list(): string[];
  getContext(): EngineContext;
  init(): Promise<void>;
  dispose(): Promise<void>;
}
```

## Depends On

- Engine Event Bus.
- System factories registered by `createEditorKernel()`.

## Folder

`src/engine/kernel/`

## State Ownership

The kernel owns the identities and lifecycle of registered systems. Runtime document and interaction state remains owned by the scoped stores supplied through `EDITOR_SYSTEM_KEYS.stores`.

## Event Flow

`EngineProvider` initializes the kernel before rendering its children. UI resolves public systems through `EngineContext`; disposal disconnects renderer, dependency indexer, and other lifecycle-aware systems.

## Performance Notes

Kernel creation is per editor mount, not per render. Store hooks select narrow slices from the kernel-owned Zustand stores.

## Known Pitfalls / Anti-Patterns

- Do not import compatibility singletons into active editor UI.
- Do not register one mutable system instance in multiple kernels.
- Do not bypass `resolveSystem()` to mutate document state.

## Extensibility

New systems register under stable keys. Plugin systems can add registrations before `init()` without changing existing consumers.
