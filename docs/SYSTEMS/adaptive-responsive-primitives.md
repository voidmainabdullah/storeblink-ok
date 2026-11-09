# Adaptive Responsive Primitives

## Purpose

Represent common commerce layouts as semantic, direction-aware primitive IR and compile them into the editor's existing `LayoutData` shape. The compiler is framework-free and produces the same deterministic geometry in editor, publication, and storefront contexts.

## Owns

- `Stack`, `Grid`, `Container`, `Cluster`, `Overlay`, `MediaFrame`, `Freeform`, and `Anchor` primitive IR.
- Logical inline/block direction mapping for LTR and RTL.
- Fluid clamp evaluation plus stable `clamp()` CSS hints.
- Container-query policy validation and active-variant selection.
- Media aspect ratio, focal point, source-set metadata, and fit behavior.
- Deterministic Anchor fallback placement and native-anchor enhancement intent.

## Does NOT Own

- React components, DOM measurement, rendering, or editor UI.
- Scene graph mutation, selection, transforms, commands, or history.
- Container observation and browser feature detection; callers provide those facts in compile context.
- Arbitrary freeform layout behavior outside the explicit compatibility-island primitive.

## Public API

```ts
compileResponsivePrimitive(
  primitive: ResponsivePrimitive,
  context: ResponsiveCompileContext,
): CompiledResponsivePrimitive;

resolveContainerQueryVariant(
  policy: ContainerQueryPolicy,
  containerInlineSize: number,
): string;

resolveResponsiveLength(
  value: ResponsiveLength,
  context: ResponsiveCompileContext,
): number;

fluidClampCss(value: FluidClampValue): string;
```

## Depends On

- Existing `LayoutData`, `AxisSizeData`, and `LayoutPadding` contracts from `src/types`.
- `adaptive-commerce/compiler/immutable` for cloned, frozen compiler output.

## Folder

`src/adaptive-commerce/responsive/`

## State Ownership

The system owns no store and performs no I/O. Primitive input and compile context are read-only. Compiled results are immutable.

## Event Flow

1. A template or certified component declares a semantic primitive.
2. Its compile context supplies writing direction, viewport inline size, nearest container inline size, and optional anchor-positioning support.
3. Logical edges, fluid lengths, query variants, and media or anchor geometry are resolved.
4. The compiler returns existing-layout-compatible data plus namespaced `adaptivePrimitive` metadata.
5. A renderer may progressively use native anchor positioning; it must retain the emitted fallback coordinates for parity.

## Performance Notes

Primitive compilation is pure and bounded by the size of one primitive. Container rules are normalized and checked for overlap before selection. No global viewport listener or shared breakpoint state exists, so nested containers remain independent.

## Known Pitfalls / Anti-Patterns

- Do not translate logical inline edges by hand in components; route them through this system so RTL stays correct.
- Do not substitute viewport breakpoints for a declared container-query policy.
- Do not discard intrinsic `hug` and wrap intent for long merchant copy.
- `Freeform` is an explicit compatibility island, not the default layout primitive.
- Native Anchor support is an enhancement only; its deterministic fallback placement remains part of the artifact contract.
- Do not add React or browser I/O to this compiler.

## Extensibility

New semantic primitives should extend the discriminated `ResponsivePrimitive` union and compile to the established layout contract. Browser-specific renderers may consume namespaced extensions, but must not change the pure compiler's geometry or mutate its output.
