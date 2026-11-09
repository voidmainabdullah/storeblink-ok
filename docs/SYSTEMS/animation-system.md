# Animation System

## Purpose
Provide shared motion policy and constant-speed timing for runtime animation
modules.

## Owns
- Distance-to-duration calculation.
- Reduced-motion preference reads.

## Does NOT Own
- Scene Graph data.
- Section content.
- Timeline editing.

## Public API
```ts
interface AnimationSystemAPI {
  durationForDistance(distancePx: number, pixelsPerSecond: number): number;
  prefersReducedMotion(): boolean;
}
```

## Depends On
- Browser motion preferences at runtime.

## Folder
`src/document/animation/`

## State Ownership
No persistent state. Marquee pause state is local transient renderer state.

## Event Flow
Section properties are validated and committed through Commands. The renderer
measures one visual cycle after content or viewport changes, then asks the
Animation System for duration. No Scene Graph writes occur during animation.

## Performance Notes
- `ResizeObserver` measures only when content geometry changes.
- `IntersectionObserver` pauses off-screen work.
- The transform animation runs on the compositor.
- The renderer repeats enough visual groups to cover the viewport and translates
  exactly one measured cycle, preventing an empty gap at any viewport width.

## Known Pitfalls / Anti-Patterns
- Do not persist measured duration; it depends on runtime width.
- Keep exactly one semantic source; every additional visual loop group must be
  `aria-hidden` and non-focusable.

## Extensibility
Future section animations can reuse the timing and reduced-motion policy without
coupling to the announcement module.
