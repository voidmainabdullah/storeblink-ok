# Production-Grade Transform Resize Pipeline

This package contains the audited resize implementation plus its performance hardening.

## Production changes

- Immutable gesture-start resize math; preview is never reused as input.
- Direction invariants prevent right/bottom resize from changing x/y.
- Rotated nodes use start-relative Moveable `beforeTranslate`.
- Single requestAnimationFrame publication clock with latest-event-wins coalescing.
- Duplicate preview publications are suppressed.
- Renderer/store consumers and dimension badge share one atomic preview source.
- No resize-handler DOM measurements.
- Moveable `useAccuratePosition` removed because it uses bounding-client-rect positioning.
- Scene Graph, commands, responsive data, and history remain commit-only.

Read:

- `ROOT_CAUSE_REPORT.md`
- `PERFORMANCE_CONTRACT.md`
- `VERIFICATION_REPORT.md`

The archive is a transform-module extract. Full browser FPS certification requires integration into the complete editor repository.
