# Responsive Rule Registry

## Purpose
Declares reusable safety, wrapping, stacking, aspect-ratio, typography, touch-target, breakpoint, and container policies per node type.

## Owns
- Built-in responsive rules.
- Runtime custom rule registrations.
- Resolution of node semantic intent over type defaults.

## Does NOT Own
- Scene Graph responsive overrides.
- Diagnostic UI state.
- Layout computation.
- Theme-specific visual tokens.

## Public API
```ts
interface ResponsiveRuleRegistryAPI {
  register(rule: ElementResponsiveRule): () => void;
  resolve(node: SceneNode): ElementResponsiveRule;
  list(): readonly ElementResponsiveRule[];
}
```

## Depends On
- Scene Graph node and responsive-intent types.

## Folder
`src/layout/rules/`

## State Ownership
The registry owns only its instance-local rule map. Built-in defaults are immutable and document-independent.

## Event Flow
Layout or diagnostic request -> rule resolution -> sizing/typography/touch policy -> computed geometry or advisory result.

## Performance Notes
Resolution is a constant-time map lookup plus a shallow semantic-intent merge.

## Known Pitfalls / Anti-Patterns
- Do not encode a theme name or template ID in a responsive rule.
- Do not use advisory rules as security or runtime blockers.
- Do not mutate a registered rule after registration.

## Extensibility
Plugins and custom node modules register rules by element type. Per-node `responsiveIntent` may safely narrow or override supported semantic behavior.
