# Responsive System

## Purpose

Resolves and persists independent Desktop, Tablet, and Mobile node overrides.

## Owns

- Active editor breakpoint
- Breakpoint definitions
- Responsive node resolution
- Responsive layout migration helpers

## Does NOT Own

- Base Scene Graph node records
- Command or History stacks
- Viewport zoom and pan
- Renderer reconciliation

## Public API

```ts
interface ResponsiveSystemAPI {
  activate(breakpoint: "desktop" | "tablet" | "mobile"): void;
  getActiveBreakpoint(): "desktop" | "tablet" | "mobile";
  breakpointForWidth(width: number): "desktop" | "tablet" | "mobile";
  resolveNode(node: SceneNode, breakpoint?: ResponsiveBreakpoint): SceneNode;
  resolveNodeForWidth(node: SceneNode, viewportWidth: number, breakpoint?: ResponsiveBreakpoint): SceneNode;
  updateLayout(node: SceneNode, breakpoint: ResponsiveBreakpoint, patch: ResponsiveNodeOverride): LayoutData;
  getValueSource(node: SceneNode, breakpoint: ResponsiveBreakpoint, target: ResponsiveOverrideTarget, property: string): ResponsiveValueSource;
  resetValueOverride(node: SceneNode, breakpoint: ResponsiveBreakpoint, target: ResponsiveOverrideTarget, property: string): LayoutData;
  shareCurrentLayout(node: SceneNode, breakpoint?: ResponsiveBreakpoint): LayoutData;
  ensureSceneOverrides(scene: SceneTree): SceneTree;
}
```

## Depends On

- Scene Graph data types
- `responsive.store`

## Folder

`src/layout/responsive/`

## State Ownership

The Responsive System exclusively writes the active breakpoint store. Responsive document overrides are written through Commands. Semantic sizing and reflow are delegated to the Layout Engine.

## Event Flow

Breakpoint control -> Responsive System -> renderer resolution. Inspector or transform commit -> Command System -> `layout.responsive` -> renderer resolution.

## Performance Notes

Breakpoint resolution merges only declared property overrides. Public viewport fitting and semantic reflow are computed by the Layout Engine before rendering.

## Known Pitfalls / Anti-Patterns

- Do not mutate base transforms during a responsive transform session.
- Do not maintain a second breakpoint state in the toolbar.
- Public and editor renderers must use the same resolver.
- Do not copy a complete resolved props/style object when changing one responsive setting.

## Extensibility

Additional breakpoints can be introduced through the breakpoint registry without changing Scene Graph node types.
