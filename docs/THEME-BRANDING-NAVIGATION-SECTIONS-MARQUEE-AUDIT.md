# Theme Branding, Navigation, Local Sections and Marquee Audit

Date: 2026-07-30

Scope: active `/dashboard/store` Engine Editor, serialized Engine Scene page
document, and read-only `/store/:slug` runtime.

## Start-State Architecture Audit

### Implemented [PASS]

- The active editor already used `EngineEditor -> EngineProvider -> CanvasShell`.
- Theme Chrome settings were stored on the Scene root and committed with a
  scene-replacement Command.
- Responsive Scene overrides, Section Registry validation, unique subtree
  cloning, revision-driven autosave, and safe runtime link resolution existed.
- Public/editor routes were lazy route chunks and the public runtime did not
  mount transform or selection behavior.

### Partially Implemented [PARTIAL]

- Theme Chrome used weak link strings and had no typed logo asset contract.
- Desktop, mobile, and footer navigation did not consume one authoritative
  navigation document.
- Logo uploads discarded intrinsic metadata and had no automatic light/dark
  variant selection.
- The mobile menu lacked shared custom-SVG handling and complete outside-click,
  breakpoint, and active-state integration.
- Registry definitions existed, but insertion placement was not validated
  before Command dispatch.
- Header/footer section instances could be silently propagated across pages.
- Atelier had a fixed-distance marquee animation rather than a universal,
  property-driven renderer.

### Missing [FAIL]

- Shared Asset System security boundary and reusable SVG sanitizer.
- Typed store-level Navigation System and stable section-anchor resolution.
- Responsive Logo System and universal mobile-menu presentation contract.
- Local-by-default page chrome ownership.
- Universal accessible Announcement Marquee.
- Build-output assertion excluding editor-only packages from the public route.

### Start-State Integration Gaps

1. Feature inspectors read uploaded files directly and lost metadata.
2. Navigation ownership was split between Scene nodes and hardcoded surfaces.
3. Page synchronization conflated reusable definitions with shared instances.
4. Marquee timing was independent of runtime content and viewport geometry.
5. Public route isolation was behavioral only, not enforced against bundle
   regressions.

## Implemented Architecture

### 1. Shared Asset and Responsive Logo Systems

- `src/assets/system/` is the single image import boundary.
- PNG, JPEG, WebP, and SVG imports retain asset ID, original source/name,
  intrinsic dimensions, aspect ratio, format, alt text, and timestamps.
- SVG is parsed and sanitized once in `svgSanitizer.ts`; scriptable elements,
  event attributes, unsafe URLs, external references, and foreign content are
  rejected or removed before persistence.
- The Scene root owns one `extensions.assetLibrary` document. Logo and menu
  settings persist asset IDs instead of duplicated upload payloads.
- Theme Chrome stores primary, light, dark, and fallback logo IDs, alt text, a
  typed link target, and independent desktop/tablet/mobile placement.
- Rendering derives light/dark choice from the current resolved header
  background, preserves intrinsic ratio with `contain`, clamps width to parent
  bounds, supports automatic or fit-header height, and provides per-breakpoint
  reset.
- Logos participate in the normal move/resize/rotate preview and Command
  lifecycle. A direct transform becomes a user-owned breakpoint override and
  survives reconciliation, save/reload, and public rendering.

### 2. Universal Mobile Navigation

- One responsive Theme Chrome contract owns menu icon kind, asset ID, size,
  stroke, color, background, border, radius, padding, presentation, breakpoint,
  and one of the two registered animations.
- Built-in two-line, three-line, and grid icons plus custom sanitized SVG use
  the same renderer across themes.
- Drawer, dropdown, and full-screen presentations share one behavior hook.
- The hook owns `aria-expanded`/`aria-controls`, initial focus, complete Tab
  wrapping, Escape close, outside-pointer close, link close, focus return, body
  scroll lock, and reduced-motion behavior.
- Desktop, mobile, and footer surfaces all resolve the same navigation document.

### 3. Store-Level Navigation System

- `src/content/menus/NavigationSystem.ts` owns versioned
  `extensions.navigation`.
- Items contain stable ID, label, typed target, order, optional parent, optional
  icon, new-tab behavior, per-breakpoint visibility, and metadata.
- Supported targets cover internal route keys, products, collections, custom
  pages, external URLs, email, phone, and stable section IDs.
- Runtime Link Resolver constructs store-slug-aware paths and blocks unsafe URI
  schemes. New-tab links receive `noopener noreferrer`.
- Deleted or unpublished entities and removed section targets stay diagnosable
  in the editor and are hidden from public navigation by default.
- Parent/child order is deterministic and parent removal cascades to descendants.

### 4. Registry Definitions and Local Section Instances

- Registry definitions remain reusable metadata; Scene subtrees are always
  independent instances with fresh IDs.
- New sections can be inserted at root, before/after a selected section, or
  inside a container explicitly marked as section-compatible.
- Missing, locked, and incompatible destinations are rejected before Command
  creation and shown as an in-place Tool message.
- New page chrome is cloned once with fresh IDs. Header, navigation surfaces,
  footer, announcement, and content instances no longer propagate silently.
- The store-level navigation document, asset library, and Theme Chrome settings
  remain shared root contracts; their rendered section instances remain local.

### 5. Universal Announcement Marquee

- Canonical section settings expose enablement, colors, typography, responsive
  font size/letter spacing/height/padding/gap/speed, separator, direction, hover
  pause, and off-screen pause.
- Each announcement is an independent editable block with its own text, color,
  and safe navigation target.
- Runtime measures one semantic cycle and the viewport with `ResizeObserver`,
  derives duration from pixels per second, and creates enough `aria-hidden`,
  non-focusable copies to cover the viewport without a blank gap.
- The track translates exactly one measured cycle with linear compositor
  motion. `IntersectionObserver`, hover, keyboard focus, and reduced-motion
  policy pause animation without Scene writes.
- Editor mode retains the original selectable child nodes; public mode emits
  one semantic source plus visual-only copies.

### 6. Editor/Public Separation

- Public renderers import kernel leaf modules instead of the editor bootstrap
  barrel, removing an accidental Selecto/Moveable dependency path.
- Vite emits explicit `vendor-editor-interaction`, `vendor-editor-dnd`, and
  `vendor-editor-panels` chunks.
- `scripts/verify-public-bundle.mjs` walks the static dependency graph rooted at
  `src/pages/Store.tsx` in `.vite/manifest.json` and fails when an editor chunk
  or editor-only package marker is reachable.

## Workflow Verification

All persistent edits introduced here use:

`Inspector/Tool -> owning system validation -> scene-replace/insert Command ->`
`History + Scene mutation -> responsive renderer -> scene revision -> autosave`

- Asset, Theme Chrome, Navigation, and Section systems return cloned next scenes;
  React controls do not persist by direct DOM or store mutation.
- Validation throws or returns a failed placement before dispatch, and the
  originating Inspector/Tool renders the message.
- History uses the same Scene Graph adapter for execute, undo, and redo.
  Revision subscribers therefore re-run rendering and autosave for all three.
- Mobile-menu state, marquee measurements, focus, and animation pause are
  transient runtime state and correctly create no Command or History entries.

## End-State Architecture Audit

### Implemented [PASS]

- Shared Asset System and shared SVG sanitizer.
- Responsive logo asset variants, placement, typed destination, and reset.
- Universal customizable mobile icon and accessible menu behavior.
- One typed, safe, store-scoped Navigation System for every surface.
- Broken reference handling and stable section anchors.
- Local section/page chrome instances with validated hierarchy insertion.
- Reusable responsive Announcement Marquee with accessibility and performance
  controls.
- Command/History/Scene/Responsive/Renderer/autosave integration.
- Manifest-enforced public/editor bundle separation.

### Missing [NONE IN CURRENT DELIVERY]

No requested runtime system is intentionally omitted. The future explicit
Shared Site Section feature is not included because this delivery establishes
the required local-by-default safety model first.

### Partially Implemented [VERIFICATION LIMITS]

- Unit/runtime-DOM coverage verifies responsive values, logo variant choice,
  menu focus behavior, link resolution, local section identity, and marquee
  geometry. A screenshot matrix across every theme and every physical device
  resolution was not automated in this repository.
- Save/publish/revision behavior is covered by service and page-document tests,
  and both live SPA routes return successfully. A credentialed remote Supabase
  upload -> publish -> reload round trip was not run in this local session.

### Remaining Integration Gaps

- The repository's root `tsconfig.json` does not type-check the full app. The
  stricter `tsconfig.app.json` still reports unrelated legacy errors; all paths
  changed by this delivery are clean under that stricter config.
- Uploaded files currently use serialized data URLs. A remote object-storage
  adapter should replace large inline sources while preserving stable asset IDs
  before substantially increasing the current upload limit.
- Nested navigation hierarchy is stored and ordered globally; the visual nested
  dropdown treatment remains a theme renderer decision.

### Runtime Verification Evidence

- `npm run test -- --maxWorkers=1`: 68 files, 260 tests passed.
- `npx tsc --noEmit`: passed.
- Strict `tsconfig.app.json` filter: no errors in touched feature paths.
- `npm run build`: passed, 2,229 modules transformed.
- `npm run verify:public-bundle`: passed across 24 public-reachable chunks.
- `http://localhost:8082/dashboard/store`: HTTP 200.
- `http://localhost:8082/store/runtime-probe`: HTTP 200 SPA route response.
- Port 8080 is not listening; the active editor development server is 8082.
- Lint was not run because the user explicitly requested that lint be ignored.

### Regression Risks

- Legacy scenes with malformed extension data depend on compatibility
  normalization; removing those migration branches would break old profiles.
- Remote asset storage must preserve asset IDs and intrinsic metadata or logo
  references will break.
- New public renderers must avoid editor bootstrap barrels or the bundle
  assertion will fail.
- A future Shared Site Section system must use explicit references and must not
  restore silent cross-page mutation.

### Technical Debt

- Make `tsconfig.app.json` the canonical CI type-check after resolving unrelated
  legacy strict errors.
- Add Playwright viewport/accessibility coverage for all registered themes.
- Add a credentialed persistence smoke environment for upload, undo/redo,
  publish, reload, and public read.
- Replace inline large asset sources with an object-storage adapter.
- Refresh the stale Browserslist database reported by the build.

### Next Actions

1. Add the browser viewport and keyboard-accessibility matrix.
2. Add the remote asset adapter without changing the Asset System public API.
3. Clean the legacy strict-TypeScript backlog and make full app type-check a CI
   gate.
4. Design explicit Shared Site Section references as a separate versioned
   feature.
