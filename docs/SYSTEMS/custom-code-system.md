# Custom Code System

## Purpose

Allow a merchant to author a Scene Graph section with React-compatible TSX, TypeScript, JavaScript, and isolated CSS without executing merchant code in the StoreBlink application origin.

## Owns

- The `custom:code` node contract and source/output limits.
- Lazy TSX compilation in the visual editor.
- The opaque-origin iframe runtime and host/runtime message protocol.
- Runtime error reporting for one custom-code node.

## Does NOT Own

- Scene Graph mutations, persistence, undo, or redo.
- Selection, transform, responsive overrides, or layer ordering.
- Store data access or privileged APIs.
- Arbitrary package installation or module imports.

## Public API

```ts
compileCustomCode(source, css, current?): Promise<CustomCodeProps>
parseCustomCodeProps(value): CustomCodeProps
createDefaultCustomCodeProps(): CustomCodeProps
```

## Depends On

- Scene Graph custom node support.
- Renderer Registry.
- `esbuild-wasm`, loaded only when the merchant applies source changes.
- A React-compatible Preact runtime embedded in the isolated frame.

## Folder

`src/extension/custom-code/`

## State Ownership

Source, CSS, compiled output, data, and runtime version are persisted in `SceneNode.props`. The Command System remains the only writer because the inspector submits one property update after a successful compile.

## Event Flow

Inspector source -> lazy compiler -> property command -> Scene Graph -> renderer invalidation -> sandbox frame. Published storefronts execute the persisted compiled output and do not load the compiler.

## Performance Notes

- Compilation is explicit and editor-only.
- Each node rerenders only when its compiled output, CSS, or data changes.
- Storefront bundles do not execute TypeScript compilation.

## Known Pitfalls / Anti-Patterns

- Never add `allow-same-origin` to the iframe sandbox.
- Never expose Supabase, auth, cookies, local storage, or parent DOM handles to merchant code.
- Never execute source directly in the editor window.
- Do not permit remote module imports; dependencies require a future signed package pipeline.

## Extensibility

The runtime protocol can add versioned, capability-scoped commerce actions later. New capabilities must be explicitly mediated by the host and validated before dispatch.
