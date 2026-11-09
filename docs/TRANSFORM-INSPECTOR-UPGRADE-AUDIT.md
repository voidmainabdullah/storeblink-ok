# Transform and Inspector Upgrade Audit

## Start Audit

### Implemented

- [x] Scene Graph is the persisted document source.
- [x] Move, resize, rotate, and scale use preview transforms and commit one command at gesture end.
- [x] Transform previews are published through a requestAnimationFrame gate.
- [x] Inspector transform values consume the active preview transform.
- [x] Viewport zoom is cursor-centered and isolated to Ctrl/Cmd + wheel on the canvas.
- [x] Focused transform, overlay, viewport, and selection tests pass (28 tests).

### Missing

- [ ] One authoritative selection visual. SVG Overlay and Moveable currently draw duplicate outlines and handles.
- [ ] Explicit Moveable remeasurement after zoom, pan, viewport resize, and preview publication.
- [ ] Cached snap candidates for the lifetime of a gesture.
- [ ] Full transform-session cleanup for interrupted gestures.
- [ ] Element, text, and image inspector sections described by the product contract.
- [ ] Renderer-backed image adjustment controls and export.
- [ ] Browser verification of drag, resize, rotate, multi-select, and zoom at multiple scales.

### Partially Implemented

- [~] Resize math uses immutable gesture-start transforms, but Moveable geometry can become stale after camera changes.
- [~] Selection geometry is zoom-aware, but Moveable control sizing is coupled to canvas zoom.
- [~] Inspector mutations are command-backed, but the UI is a minimal generic panel and repeated field edits are not coalesced.
- [~] Image editing supports replace and fit only.
- [~] Fill, stroke, effects, and typography exist in the data model but expose only a small subset of controls.

### Technical Debt

- `MoveableAdapter` and `OverlayRenderer` both own the same visible selector.
- Snap geometry performs sibling traversal and world-bound calculation on every pointer event.
- `EngineInspectorPanel.tsx` combines orchestration and all field rendering in one component.
- Field-update commands do not merge rapid edits to the same field.
- Image filters have no shared renderer utility or typed property contract.

### Regression Risk

- High: transform target measurement under nested viewport transforms.
- High: multi-selection resize and rotation.
- Medium: responsive override commits from inspector fields.
- Medium: style rendering changes can affect storefront output.
- Low: inspector chrome and disclosure state.

### Next Actions

1. Make SVG Overlay own the outline and Moveable own interactive handles only.
2. Cache gesture snap candidates and harden session cancellation.
3. Remeasure Moveable on camera and preview changes with one RAF gate.
4. Split inspector controls into reusable command-bound sections.
5. Add renderer-backed image adjustments and export.
6. Verify focused tests, full tests, TypeScript, build, and real browser interactions.

## End Audit

### Implemented

- [x] SVG Overlay is the single selection-outline and dimension-badge owner.
- [x] Moveable owns handles only and has `hideDefaultLines` enabled.
- [x] Resize uses immutable gesture-start geometry and rejects non-finite input.
- [x] Pointer updates are RAF-coalesced previews; Scene Graph receives one command on release.
- [x] Snap sibling geometry is indexed once per move gesture.
- [x] Interrupted gestures cancel on Escape, window blur, and hidden document state.
- [x] Responsive and base nodes commit together in one multi-selection transform command.
- [x] Active transforms use temporary interaction elevation without z-index or History mutation.
- [x] Camera writes reject invalid values and preserve the document point under cursor-centered zoom.
- [x] Moveable remeasures once per camera, viewport-size, target, or committed-scene change.
- [x] Element Header, Position, Layout, Appearance, Fill, Stroke, Effects, and Hierarchy controls are command-backed.
- [x] Text resizing, typography, alignment, direction, OpenType, text fill, and inline content editing are renderer-backed.
- [x] Image replace, fit, crop framing, scale, position, opacity, adjustments, effects, and client export are renderer-backed.
- [x] Persisted inspector anchors render as DOM IDs.
- [x] Centered strokes split across the node edge and multiple fills composite as CSS layers.
- [x] Rapid edits to the same node field coalesce into one History entry.
- [x] Transform and Inspector system contracts are documented in `docs/SYSTEMS/`.
- [x] TypeScript, all 64 test files / 240 tests, and production build pass.

### Missing

- [ ] A configured production image-processing provider for Remove Background and AI Enhance.
- [ ] An authenticated browser-test fixture that can open `/dashboard/store` in clean Chromium.

Provider-dependent actions are visibly disabled with explanatory tooltips. They do not claim success or write fake image data.

### Partially Implemented

- [~] Automated browser launch reached the application but redirected to `/auth`; authenticated drag, resize, rotate, and multi-selection could not be smoke-tested in that clean profile.
- [~] Gradient fills render correctly, but arbitrary imported CSS gradients cannot apply an independent per-fill opacity without parsing and rewriting their color stops.

### Technical Debt

- Add an authenticated E2E fixture with a seeded Engine Scene and stable product/store profile.
- Choose and configure an image-processing provider before enabling AI image actions.
- Add a typed gradient model if per-stop and per-layer gradient editing is required.
- Refresh the repository Browserslist database; the build reports that `caniuse-lite` is outdated.

### Regression Risk

- Medium: rotated group resize still depends on Moveable start-relative translation; pure math coverage passes, but authenticated browser interaction remains blocked.
- Low: nested camera transforms; repeated zoom and camera remeasurement integration tests pass.
- Low: responsive transform commits; mixed responsive/base atomic-command tests pass.
- Low: inspector mutations; command, renderer, export, and UI tests pass.

### Issue Diagnosis

#### Duplicate selection outlines

- Root Cause: SVG Overlay and Moveable both rendered the target perimeter.
- Current Behavior Before Fix: two borders diverged during transform and zoom.
- Correct Behavior: one 2px `#0178ff` outline with independent interactive handles.
- Implemented Fix: Overlay owns the outline; Moveable default lines are hidden.
- Verification: CanvasShell integration asserts one selected polygon and `hideDefaultLines=true`.
- Performance Impact: removes redundant line painting without adding subscriptions.

#### Resize drift and delayed dimensions

- Root Cause: noisy Moveable translations could influence axis-aligned x/y, and all consumers did not share one preview clock.
- Current Behavior Before Fix: resize could jump, drift, or show dimensions only after release.
- Correct Behavior: fixed opposite edge, live dimensions, and one final Scene Graph commit.
- Implemented Fix: immutable-start resize math, finite clamping, RAF preview publication, shared preview readers, and one commit.
- Verification: 500-frame drift tests, zoom-invariance tests, non-finite tests, preview/commit tests.
- Performance Impact: at most one preview publication per animation frame and no Scene Graph write during movement.

#### Zoom instability

- Root Cause: camera changes did not explicitly refresh Moveable target geometry.
- Current Behavior Before Fix: handles could remain at stale screen coordinates after zoom or pan.
- Correct Behavior: content, outline, and handles remain attached at every supported zoom.
- Implemented Fix: finite cursor-centered Viewport updates and camera-only RAF `updateRect()`.
- Verification: repeated zoom anchor invariant plus mounted CanvasShell camera/overlay integration test.
- Performance Impact: one coalesced measurement per camera frame, never per transform preview.

#### Inspector controls without renderer contracts

- Root Cause: the former generic panel exposed only a subset of stored fields and several values had no renderer interpretation.
- Current Behavior Before Fix: sparse controls and edits with little or no visible output.
- Correct Behavior: type-specific, command-backed controls whose values render identically in editor and storefront.
- Implemented Fix: modular Header, Transform, Appearance, Typography, Image, and Export panels; expanded renderer style and image pipelines.
- Verification: inspector interaction, renderer style, image adjustment, export, command merge, TypeScript, and full-suite tests.
- Performance Impact: only the selected inspector and affected node update; rapid same-field History entries merge.

### Next Actions

1. Configure production image-processing callbacks for Remove Background and AI Enhance.
2. Add an authenticated Chromium E2E account/fixture and run real drag, rotated resize, rotate, multi-select, and zoom scenarios.
3. Introduce a typed gradient-stop model only if independent gradient-layer opacity becomes a product requirement.
