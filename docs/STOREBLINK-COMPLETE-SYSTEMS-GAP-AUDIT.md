# StoreBlink Complete Systems Gap Audit

**Audit date:** 2026-07-31  
**Theme Phase 0 verification refresh:** 2026-08-20  
**Audit type:** Static architecture trace, current verification gates, launch-readiness assessment  
**Repository:** `F:\Storeblink`  
**Decision:** **NO-GO for a public production-commerce launch**

## 1. Status Model

| Status | Meaning |
|---|---|
| `IMPLEMENTED` | The active runtime contains the capability and current evidence verifies its core contract. |
| `PARTIAL` | Useful code exists, but the production contract is incomplete, bypassed, unverified, or too narrow. |
| `MISSING` | No production implementation was found in the active runtime. |
| `FAILED` | An expected verification gate currently fails. |
| `UNVERIFIED` | Code or SQL exists, but the required external/runtime state could not be verified. |

Priority:

- `P0`: Blocks a safe public launch.
- `P1`: Required for a stable merchant beta or production-quality operation.
- `P2`: Ecosystem and advanced-scale capability.

## 2. Scope and Method

This report traces the active application rather than counting filenames as completed systems.

The live editor route is:

```text
/dashboard/store
-> MyStore
-> EngineEditor
-> EngineProvider(createEditorKernel())
-> CanvasShell
-> RendererSystem / RendererRegistry
-> Scene Graph
```

The public route is:

```text
/store/:slug
-> Store
-> StorefrontDataResolver
-> StorefrontRuntime
-> SceneRenderProvider
-> RenderNode / RendererRegistry
```

Evidence was collected from:

- 469 TypeScript, TSX, and CSS source files, approximately 49,445 lines.
- Active routes and editor/storefront composition.
- Scene, command, history, renderer, interaction, responsive, asset, page, theme, publishing, and commerce code.
- All 16 local Supabase migrations.
- Package, build, lint, test, dependency, and deployment configuration.
- Current executable verification gates listed below.

This was not a browser interaction certification. The repository has no Playwright/Cypress suite, no visual regression suite, and no browser matrix.

## 3. Verification Results

| Gate | Result | Current evidence |
|---|---|---|
| `npx tsc --noEmit` | `PASS` | TypeScript completed with exit code 0. |
| `npm run build` | `PASS` | 2026-08-20: Vite transformed 2,491 client modules, produced SSR/client bundles, and passed browser-runtime config verification. |
| `npm run verify:public-bundle` | `PASS` | Editor isolation verified across 24 public-reachable chunks. |
| Four single-worker Vitest shards | `PASS` | 2026-08-20: 141 files and 532 tests passed. |
| `npm run verify:themes` | `PASS` | 2026-08-20: all four built-in themes passed desktop, tablet, and mobile readiness with zero blocking diagnostics. |
| `npm run lint` | `FAILED` | 2026-08-20: 2 unrelated `no-control-regex` errors and 29 warnings remain; changed theme-system files have no lint errors. |
| `npm audit --omit=dev` | `FAILED` | 6 known vulnerabilities: 4 high and 2 moderate, including `brace-expansion` DoS and React Router advisories. |
| `npx supabase migration list` | `UNVERIFIED` | Checkout is not linked to a Supabase project. Remote migration state is unknown. |
| `npm run verify:engine-scenes` | `UNVERIFIED` | Cannot inspect existing profiles because `SUPABASE_SERVICE_ROLE_KEY` is not configured. |
| Browser editor E2E | `MISSING` | No repository Playwright/Cypress tests. |
| Storefront purchase E2E | `MISSING` | No checkout exists and no E2E test harness exists. |
| CI/deployment gate | `MISSING` | No `.github`, `netlify.toml`, `vercel.json`, or `Dockerfile`. |

Build-size evidence:

- `vendor-react`: 298.91 kB raw / 87.64 kB gzip.
- `vendor-editor-interaction`: 266.10 kB raw / 85.23 kB gzip.
- `vendor-supabase`: 215.21 kB raw / 55.72 kB gzip.
- `MyStore`: 187.80 kB raw / 53.38 kB gzip.
- Global CSS: 114.90 kB raw / 19.49 kB gzip.

These numbers are not automatically failures, but there is no browser performance budget proving acceptable startup, interaction FPS, or memory use.

## 4. Executive Verdict

StoreBlink has a real Scene Graph editor, a command-backed transform preview lifecycle, responsive overrides, automatically discovered theme packages, public runtime isolation, dynamic product rendering, and draft/publish service abstractions. This is meaningful implementation, not a demo-only shell.

It is not yet a production commerce platform. The largest blockers are:

1. No functioning cart surface, checkout, payment gateway, server-priced order creation, shipping, tax, discount, or fulfillment flow.
2. Existing order insert policies accept client-provided totals and line prices without a transactional server checkout.
3. Remote database migrations and migration of all existing profiles cannot be verified.
4. Public reads retain a legacy `theme` fallback, so strict draft/published isolation depends on unverified deployed database architecture.
5. Persisted/imported SVG node markup is rendered with `dangerouslySetInnerHTML` without validation at the render/load boundary.
6. Project schema migration is a no-op; node schemas are generic and unversioned.
7. Autosave recovery is not durable or restorable, and conflict handling/offline retry are absent.
8. Full unit/integration tests pass, but repository lint is still red and no browser E2E, visual regression, accessibility, fault-injection, or performance-regression suite exists.
9. No production observability, deployment pipeline, CSP/security-header configuration, or incident runbook exists.
10. SEO is a single client-rendered Storeblink document, not per-store/page/product SEO.

## 5. P0 Launch Blockers

| ID | Blocker | Root evidence | Required closure |
|---|---|---|---|
| P0-01 | Commerce cannot complete a purchase | `ProductDetail.tsx` navigates to `?checkout=1`; `Store.tsx` only reads `preview=draft`. No cart/checkout route or surface handles that query. | Implement server-owned checkout, cart UI, inventory reservation, payment, confirmation, and failure recovery. |
| P0-02 | Client-controlled order money | SQL permits public order/order-item inserts while `total_cents` and `unit_price_cents` are submitted values. | Replace public table inserts with an idempotent server function that reloads product prices, validates stock, calculates totals, and commits atomically. |
| P0-03 | Remote schema is unknown | `supabase migration list` fails because the checkout is not linked. | Link the production project, diff remote/local schema, deploy in staging, run SQL/RLS validation, then promote. |
| P0-04 | Existing profiles are unverified | `verify:engine-scenes` cannot run without a service-role key. | Run migration and verification in a controlled environment; record counts, failures, backups, and rollback evidence. |
| P0-05 | Stored SVG XSS boundary is incomplete | `SvgRenderer.tsx:99-121` renders `node.props.markup` through `dangerouslySetInnerHTML`; scene props are `Record<string, unknown>`. | Sanitize on every import/load/migration boundary and enforce a typed SVG node schema before rendering. Add malicious-scene fixtures. |
| P0-06 | No real document migration engine | `engine/serialization/index.ts:8-12` ignores versions and only validates. | Add ordered project/node migrations, backups, compatibility policy, failure recovery, and fixture tests. |
| P0-07 | Draft recovery does not recover | `EngineEditor.tsx:1311-1371` writes/removes a local backup but never restores it; publication recovery is an in-memory `Map`. | Add IndexedDB recovery, startup detection, restore/discard UI, retry queue, and durable publication rollback. |
| P0-08 | Public fallback weakens publish isolation | `supabaseStorefrontGateway.ts:84-90` returns legacy `profiles.theme` when modern architecture is missing. | Remove only after production RPC/schema deployment is verified and every profile has a published artifact. |
| P0-09 | Release gates are not fully green | Unit/integration tests, TypeScript, theme readiness, and production build pass; full lint still has 2 errors and 29 warnings, and the dependency audit was not refreshed in Theme Phase 0. | Clear the remaining repository-wide gates and enforce them in CI. |
| P0-10 | No browser certification | No E2E, visual, accessibility, or browser-matrix suite. | Automate critical editor, publish, storefront, cart, checkout, and recovery paths in supported browsers/devices. |
| P0-11 | No production security headers/monitoring | No CSP/deployment config, no client reporting, no structured logs, no alerts. | Add hosting config, CSP, error/performance telemetry, correlation IDs, alerting, and incident procedures. |
| P0-12 | SEO is not storefront-aware | `index.html` contains one mojibake Storeblink title and global OG metadata; runtime is client-only `BrowserRouter`. | Add SSR/prerender or equivalent crawlable output, page/product metadata, canonical URLs, JSON-LD, sitemap, and robots controls. |

---

# Detailed Systems Audit

## 1. Core Editor Document Architecture

**Implemented**

- `IMPLEMENTED`: Stable IDs use `crypto.randomUUID()` with clone remapping.
- `IMPLEMENTED`: Scene data is normalized into `rootNodeId` plus `nodes: Record<NodeId, SceneNode>`.
- `IMPLEMENTED`: Parent/child backlink, cycle, reachability, and missing-node validation exists in `engine/validation/schemas.ts`.
- `IMPLEMENTED`: The active editor persists an Engine Scene and renders through the Scene Graph path.

**Partial or missing**

- `MISSING P0`: Official per-node `NodeSchema` registry with version, parent/child rules, defaults, editable/responsive properties, and capabilities.
- `MISSING P0`: Actual project/node migration execution. `CURRENT_SCHEMA_VERSION` is 1 and `migrate()` ignores `fromVersion`/`toVersion`.
- `PARTIAL P0`: Unknown renderer fallback exists, but the element-type schema rejects unsupported non-`custom:*` values before a recovery UI can handle them.
- `MISSING P1`: Document garbage collector for assets, links, dead references, and orphaned data.
- `MISSING P1`: Referential dependency graph.
- `PARTIAL P0`: Theme migration planning/backups exist, but they are not a complete project migration system and all current theme schemas remain version 1.

**Technical debt / bottleneck**

- `SceneGraph` clones the complete tree for create, update, delete, move, and clone, then validates the complete tree on every commit (`SceneGraph.ts:28-109`, `198-201`). This makes mutation cost grow with total document size.
- `props` and `extensions` are untyped `Record<string, unknown>` (`types/editor-engine.ts:102-114`), allowing malformed imported payloads to reach renderers.

**Regression risk:** High. A new node/property can silently create invalid semantic structures despite structural tree validity.

**Next action:** Build the schema registry and ordered migration runner first, then make commands validate affected nodes/relationships incrementally.

## 2. Selection System

**Implemented**

- `IMPLEMENTED`: Shift/toggle selection, marquee selection, mixed-node multi-selection, selection bounds, and multi-node movement.
- `IMPLEMENTED`: Rotated point hit testing uses OBB geometry and paint order.
- `IMPLEMENTED`: Hidden/locked nodes are excluded from canvas hit testing.

**Partial or missing**

- `PARTIAL P0`: Region selection uses AABB intersection only (`HitTestingSystem.ts:45-50`); there is no contained-only mode, mask/clip/alpha-aware hit test, or transparent-pixel policy.
- `MISSING P0/P1`: Click-through priority cycle, modifier overlap picker, isolation/deep selection, Escape-to-parent, and selection memory per page/template.
- `PARTIAL P0`: Locked nodes cannot be selected through the same selection system, including layer-oriented workflows; professional editors normally permit inspection/unlock without canvas transform.
- `MISSING P1`: Searchable overlapping-element picker.

**Technical debt / bottleneck**

- The spatial index is fully rebuilt for every scene create/update/delete/move event (`HitTestingSystem.ts:77-82`) and is also reconfigured from `CanvasShell` on scene revisions.

**Regression risk:** High for large scenes and nested/overlapping designs.

**Next action:** Add incremental spatial-index updates, explicit hit-test policies, overlap cycling, and isolation state with browser tests.

## 3. Drag, Resize, Rotate and Transform Engine

**Implemented**

- `IMPLEMENTED`: Immutable transform start, RAF-coalesced preview state, one command on commit, cancel, resize, rotate, scale, and multi-selection.
- `IMPLEMENTED`: Preview transforms are separate from persisted Scene Graph state.
- `IMPLEMENTED`: Temporary interaction elevation is separate from persistent z-order.
- `IMPLEMENTED`: World-coordinate/matrix helpers and Escape/window-blur cancellation exist.

**Partial or missing**

- `PARTIAL P1`: Snapping supports move against grid/edge/center targets, but not resize, rotate, baseline, equal gaps, spacing, sections, or multi-selection.
- `MISSING P1`: Smart-guide rendering and distance labels. `computeSnap()` returns guides, but `TransformSystem` only consumes `snappedDelta`.
- `MISSING P0`: Document-wide pixel rounding policy.
- `PARTIAL P0`: Global minimum size is 1; there are no type-specific min/max constraints.
- `PARTIAL P0`: Aspect lock exists in UI/Moveable behavior but lacks a unified node capability contract.
- `UNVERIFIED P0`: Pointer capture and drag behavior have unit/component coverage but no real-browser gesture certification.
- `MISSING P1`: Deliberate touch/stylus pressure and gesture policy.

**Technical debt / bottleneck**

- `CanvasShell`, `MoveableAdapter`, and renderers import global singleton systems/stores directly even though the kernel registers systems. Multiple editor instances are not isolated.
- Preview performance is architecturally better than scene-per-move writes, but no 60 FPS trace or long-scene benchmark exists.

**Regression risk:** Medium-high. Core math is credible; DOM integration and zoom/device behavior remain unproven.

**Next action:** Browser-test fixed-edge invariants at multiple zoom levels, move snap output into overlay state, and make system instances kernel-owned.

## 4. Layout Engine

**Implemented**

- `IMPLEMENTED`: Absolute positioning and theme-specific structured reflow for header, hero, rich text, product grids, and sections.
- `IMPLEMENTED`: Section height recalculation exists for supported structured section types.

**Partial or missing**

- `MISSING P0`: Generic Auto Layout engine.
- `MISSING P0`: Generic flex/grid layout computation despite `layout.mode` advertising `absolute | flex | grid`.
- `MISSING P0`: Constraint engine, intrinsic sizing, content-driven reflow, min/max units, percent units, and general aspect-ratio constraints.
- `PARTIAL P1`: Absolute overlays exist by normal absolute nodes, not as a governed overlay layout system.
- `MISSING P1`: Sticky/fixed positioning engine, safe-area inset rules, and complete RTL layout behavior.

**Technical debt / bottleneck**

- `StructuredLayoutSystem.ts` contains theme/content-specific numeric layout formulas. It is useful scaffolding, not a universal layout engine.
- `ConstraintData` and `AutoLayoutData` are currently untyped records.

**Regression risk:** High. New templates can require additional hardcoded reflow branches.

**Next action:** Implement generic measured layout output and constraints before adding more theme-specific layout code.

## 5. Universal Responsive Engine

**Implemented**

- `IMPLEMENTED`: Independent desktop/tablet/mobile overrides, inheritance, per-value reset, promote/share, breakpoint preview, and final storefront resolver.
- `IMPLEMENTED`: Canonical scene widths can be scene-owned.
- `IMPLEMENTED`: Structured mobile header/nav and product-grid reflow.

**Partial or missing**

- `PARTIAL P0`: Responsive intent is stored as full transform/props/style/meta overrides rather than semantic sizing/flow intent.
- `PARTIAL P1`: Intermediate widths scale only `x`, `width`, and selected large typography (`ResponsiveSystem.ts:151-180`); vertical flow and height are not continuously resolved.
- `PARTIAL P0`: Inspector exposes breakpoint context but not a complete inheritance/source visualization for every property.
- `MISSING P0`: Per-element responsive rule registry and dependency recalculation graph.
- `MISSING P1`: Content/container-based breakpoints and governed custom breakpoints.
- `MISSING P1/P0`: Responsive screenshot comparison and issue panel.

**Technical debt / bottleneck**

- Every node can carry complete overrides for all three breakpoints, increasing document size and migration complexity.
- Breakpoints are fundamentally three fixed modes (640/1024 thresholds; 390/768/1200 defaults).

**Regression risk:** High for arbitrary merchant content and widths not represented by the three canonical previews.

**Next action:** Introduce semantic responsive constraints, measured content reflow, and automated screenshot tests at boundary and intermediate widths.

## 6. Reusable Components and Symbols

**Implemented**

- `IMPLEMENTED`: Reusable section/block definitions and presets exist in the Section Registry/factory.
- `PARTIAL`: `meta.componentId` exists as metadata.

**Missing**

- `MISSING P0`: Component definitions, instances, override scopes, instance propagation, component properties, and reusable symbol semantics.
- `MISSING P1`: Detach, variants, impact preview.
- `MISSING P2`: Nested components and cross-store component libraries.

**Technical debt / bottleneck:** A section preset creates independent nodes; it does not remain linked to a source definition.

**Regression risk:** High for future global reuse because teams may encode one-off synchronization in themes/pages.

**Next action:** Define component source/instance/override identity before expanding preset reuse.

## 7. Layers and Z-Index System

**Implemented**

- `IMPLEMENTED`: Hierarchical Scene Graph, structured layer tree, dnd-kit reorder within valid structured parents, hide/lock, duplicate, and rename-related node metadata.
- `IMPLEMENTED`: Interaction elevation does not mutate persistent z-order.

**Partial or missing**

- `PARTIAL P0`: Bring-to-front/send-to-back exist by writing global min/max z-index; bring-forward/send-backward are absent.
- `PARTIAL P0`: Structured reorder limits moves to the current parent; there is no schema-governed reparenting UI.
- `MISSING P0`: Scoped stacking-context manager and z-index normalization.
- `MISSING P1`: Layer search/filter and virtualization.
- `PARTIAL P0`: Rename/duplicate IDs are generated, but no centralized semantic name/slug collision policy exists across all document entities.

**Technical debt / bottleneck:** z-index scans every node and ignores parent stacking scope (`EngineEditor.tsx:1176-1180`).

**Regression risk:** Medium-high for nested sections and large documents.

**Next action:** Make parent child-order the primary paint order, expose all four permanent reorder commands, and normalize scoped stacking.

## 8. Styling and Design System

**Implemented**

- `IMPLEMENTED`: Fills, strokes, effects, opacity, corner radius, gradients/image fills, and local inspector controls exist.
- `IMPLEMENTED`: Theme runtime exposes semantic color/typography/chrome settings and CSS custom properties.
- `IMPLEMENTED`: Recent/brand palette persistence exists, although its current normalization test fails.

**Partial or missing**

- `PARTIAL P0`: Theme tokens exist per theme/runtime but there is no universal merchant variable/token manager with usage tracking.
- `MISSING P0`: Global style manager and style inheritance/source inspector.
- `MISSING P1`: Named color/typography/effect styles and style copy/paste.
- `PARTIAL P1`: Effects/borders are implemented as node values, without robust stack editors and capability schemas for every element.
- `MISSING P1`: Safe custom CSS sandbox.

**Technical debt / bottleneck:** Main inspector behavior is largely hand-coded instead of rendered from the Property Registry.

**Regression risk:** Medium-high. Similar controls can diverge across text/image/shape inspectors.

**Next action:** Make typed property schemas and theme variables the shared source for inspector, renderer, responsive overrides, and migration.

## 9. Typography Engine

**Implemented**

- `IMPLEMENTED`: Font family, weight, size, line height, letter spacing, alignment, vertical alignment, transform, decoration, direction/writing mode, and OpenType input controls.
- `IMPLEMENTED`: Auto-width/auto-height measurement and double-click inline editing with focus/caret placement.
- `IMPLEMENTED`: Dynamic text binding for product/store fields.

**Partial or missing**

- `PARTIAL P0`: Font manager is six hardcoded system choices; no upload/provider loading, preload, fallback validation, or licensing metadata.
- `PARTIAL P0`: Text measurement uses live DOM `scrollWidth/scrollHeight`, not a centralized cached measurement service.
- `MISSING P0`: Rich text ranges, links, lists, mixed styles, and paste sanitization.
- `PARTIAL P0`: Editing is isolated visually, but no explicit IME/composition handling or selection-preservation model exists.
- `PARTIAL P0`: Fixed/auto-width modes exist; comprehensive overflow, clamp, ellipsis, and min/max policies do not.
- `PARTIAL P1`: Direction/writing-mode CSS exists, but full international shaping/font fallback/locale testing does not.

**Technical debt / bottleneck:** `TextRenderer` imports global selection/responsive systems and commits text only on blur.

**Regression risk:** High for multilingual and rich-content stores.

**Next action:** Add a text document model, composition tests, font asset manager, and centralized measurement cache.

## 10. Asset and Media System

**Implemented**

- `IMPLEMENTED`: Central scene asset library records images, dimensions, format, alt text, and timestamps.
- `IMPLEMENTED`: PNG/JPEG/WebP/SVG validation, 8 MB limit, intrinsic measurement, and SVG sanitizer on the AssetSystem upload path.
- `IMPLEMENTED`: Independent image nodes, replacement control, object position, scale, visual adjustments, effects, and export.
- `IMPLEMENTED`: Curated/lazy icon adapters avoid loading entire icon libraries.

**Partial or missing**

- `PARTIAL P0`: Raster data is stored as base64 inside scene JSON; there is no object-storage/CDN pipeline, deduplication, background upload, retry, or renditions.
- `PARTIAL P0`: Focal position exists as percentages, but no visual focal-point model shared with crop.
- `PARTIAL P0`: Crop is CSS object-fit/scale/position, not a durable non-destructive crop transform.
- `PARTIAL P0`: `ImageInspector` replacement bypasses AssetSystem validation and directly writes a FileReader data URL (`ImageInspector.tsx:84-93`).
- `MISSING P1`: Asset usage/dependency graph and safe deletion.
- `PARTIAL P0`: Image loading/empty states exist in templates, but there is no universal upload progress/error/retry state.
- `PARTIAL P1`: Video is a node type, not a production media processing/playback system.
- `PARTIAL P0`: SVG upload sanitizer exists, but persisted/imported `props.markup` is not sanitized at the renderer boundary.

**Technical debt / bottleneck:** Large scenes can repeatedly serialize megabytes of embedded asset data during audits, autosave, clone, and publish.

**Regression risk:** Critical due to SVG injection and high due to document growth.

**Next action:** Move binary assets to object storage, enforce one import service, model crop/focal data, and sanitize every SVG load path.

## 11. Header, Navigation and Hamburger

**Implemented**

- `IMPLEMENTED`: Shared theme chrome settings, logo slots, editable navigation graph, ordering, nesting, internal/custom targets, icons, active routes, and broken-link resolution.
- `IMPLEMENTED`: Desktop/mobile visibility, responsive hamburger mirror, keyboard-aware mobile menu hook, focus behavior tests, and body-scroll handling.
- `IMPLEMENTED`: Header nodes/logo are independently selectable and transformable.

**Partial or missing**

- `PARTIAL P0`: Multiple header looks are theme implementations, not formal header-layout variants with a common capability contract.
- `PARTIAL P0`: Header state (transparent/scrolled/sticky) is not a complete state engine.
- `MISSING P1`: Mega-menu builder and search drawer.
- `MISSING P0`: Central overlay coordinator for menu, search, account, cart, and modals.
- `MISSING P0`: Functional cart drawer; the cart action only navigates to an unhandled query parameter.
- `PARTIAL P0`: Resize-while-open and full focus trap/restore behavior have narrow tests, not a browser matrix.

**Technical debt / bottleneck:** Structured header reflow contains explicit coordinate formulas and cloned mobile-link nodes.

**Regression risk:** Medium-high across themes and noncanonical widths.

**Next action:** Formalize header/mobile-menu state machines and central overlay ownership, then browser-test all themes.

## 12. Page and Template System

**Implemented**

- `IMPLEMENTED`: Home and custom pages, unique slugs, activation, serialization, custom-page public routes, and template application.
- `IMPLEMENTED`: Header/footer are copied into new page scenes and global chrome settings are synchronized through root extensions.
- `IMPLEMENTED`: Theme packages are automatically discovered with `import.meta.glob`.

**Partial or missing**

- `MISSING P0`: Page/template rename, delete, duplicate, draft status, scheduling, page SEO, and page settings API.
- `PARTIAL P0`: Shared chrome is copied as local instances rather than represented by true global component references.
- `PARTIAL P1`: Conditional visibility is breakpoint/manual state, not expression-driven sections.
- `PARTIAL P0`: Empty image/product states exist for selected templates but are not a universal renderer contract.
- `MISSING P0`: Template assignment/version state backed by the new domain tables in active UI.
- `PARTIAL`: `src/themes/threadtemplate` is empty; legacy `threadtemplate` IDs are reconciled to Basic and intentionally excluded from available templates.

**Technical debt / bottleneck:** `PageDocumentSystem` only exposes load/get/activate/add/serialize; copied chrome can drift visually per page.

**Regression risk:** High for multi-page merchant maintenance and theme upgrades.

**Next action:** Add complete page lifecycle commands and true shared references before multiplying page types.

## 13. Dynamic Data Binding System

**Implemented**

- `IMPLEMENTED`: Product/store bindings to `text`, `label`, `src`, and `alt`, optional currency formatting, product-slot synchronization, and editor/storefront preview data.
- `IMPLEMENTED`: Product references persist as IDs and resolve against live catalog data.

**Partial or missing**

- `PARTIAL P0`: Binding model is a narrow object, not a typed expression/path model.
- `PARTIAL P0`: Product selection UI exists for product-linked nodes, but no universal dynamic source picker.
- `PARTIAL P0`: Invalid bindings return no value rather than producing a typed diagnostic/fallback workflow.
- `MISSING P1`: Dependency tracking and impact preview.
- `MISSING P1`: Metafields/custom data.
- `MISSING P0`: General collection/product loop blocks, pagination context, and conditional expressions.
- `PARTIAL P0`: Catalog loading/empty states exist at page level, not per binding/loop.

**Technical debt / bottleneck:** Binding values are stored in generic `extensions` and validated only when resolved.

**Regression risk:** High as new entity types are added.

**Next action:** Add a versioned binding schema, source registry, dependency graph, typed fallback, and repeat/condition nodes.

## 14. Commerce Systems

**Implemented**

- `IMPLEMENTED`: Basic product create/delete/publish toggle, catalog listing, product detail, search, sorting, category-derived collection views, cart quantity hook, and merchant order-status dashboard.
- `IMPLEMENTED`: SQL scaffolding exists for variants, inventory, collections, and inventory reservation.

**Partial or missing**

- `PARTIAL P0`: Product management has no edit workflow and only a single practical stock/price model in active UI.
- `MISSING P0`: Product variant UI/runtime selection and inventory integration.
- `PARTIAL P0`: Collections are inferred from category strings; there is no complete collection admin/entity workflow.
- `PARTIAL P0`: Cart is only localStorage `Record<productId, quantity>`; no cart page/drawer, price refresh, stock validation, or server session.
- `MISSING P0`: Checkout, payment provider, shipping, tax, discount engine, transactional order creation, fulfillment, refunds, and idempotency.
- `PARTIAL P0`: Orders can be read/status-updated, but the active storefront never creates a valid order.
- `MISSING P0`: Customer accounts/order history.
- `PARTIAL P0`: Search/sort exist; production filters/facets do not.
- `MISSING P1/P2`: Multi-currency, localization, markets, digital products, subscriptions, and gift cards.

**Critical data-integrity issue**

`orders.total_cents` and `order_items.unit_price_cents` are client-writable columns. Public insert policies check the store/order relationship but do not recompute money, reserve inventory, or atomically bind lines to a server-created checkout (`20260419094429...sql:65-132`, `20260727000200...sql:1269-1277`).

**Fabricated storefront data**

`components/store/storeUtils.ts:1-30` explicitly uses deterministic mock helpers for discount, rating, sold count, and review count. Public product cards/details display values not sourced from merchant data.

**Regression risk:** Critical. Public launch could misrepresent product information and an eventual direct order insert flow would be financially unsafe.

**Next action:** Build the server checkout aggregate first; do not connect UI to the existing public insert policies.

## 15. Forms System

**Implemented**

- `PARTIAL`: A hardcoded contact form has required HTML fields and a visual success toast.

**Missing**

- `MISSING P0/P1`: Form schema/builder, typed field registry, server validation, spam protection, submission storage, notifications, consent/privacy fields, and durable success/error states.
- `MISSING P0`: Newsletter submission behavior.

**Evidence**

`Store.tsx:1033-1039` prevents submit, displays "Message received," resets the form, and states that an inbox can be connected later. No message is delivered or stored.

**Regression risk:** High reputational risk because the UI reports success when no submission occurs.

**Next action:** Remove false-success behavior until a secure submission endpoint exists, then build a reusable form service.

## 16. Editor History and Transactions

**Implemented**

- `IMPLEMENTED`: Command execute/undo/redo, branch clearing after new dispatch, transform command merging, and a 100-entry cap.
- `IMPLEMENTED`: Transform gestures commit once on release.

**Partial or missing**

- `PARTIAL P0`: No explicit transaction boundary spanning scene, page document, assets, navigation, and theme settings.
- `PARTIAL P0`: Command merging exists for supported commands, not a general transaction/coalescing policy.
- `MISSING P1`: Persistent history, history panel, named checkpoints, and branching visualization.
- `PARTIAL P0`: Publication snapshots exist in SQL/service, but active rollback UI uses in-memory recovery points.

**Technical debt / bottleneck**

- Undo/redo stacks are module-global arrays, not kernel/store/page scoped (`engine/history/index.ts:4-7`).
- Scene replacement commands clone full before/after trees when created and again on execute/undo (`sceneReplaceCommand.ts:14-23`).

**Regression risk:** High for multiple documents, long sessions, and large scenes.

**Next action:** Add scoped transaction/history instances and diff/operation commands for page/theme operations.

## 17. Clipboard, Duplicate and Import Systems

**Implemented**

- `IMPLEMENTED`: Internal clipboard utility, subtree copy, fresh ID remapping, duplicate, and tests.

**Partial or missing**

- `PARTIAL P0`: Active `EngineEditor` does not use the persistence clipboard system; it maintains separate local React clipboard state (`EngineEditor.tsx:188`, `1104-1125`).
- `MISSING P0/P1`: Cross-template compatibility checks, cross-store clipboard, OS clipboard format, paste-style-only, and export package.
- `PARTIAL P0`: General scene validation exists, but import sanitization is not node-type/capability complete and persisted SVG markup can bypass the upload sanitizer.

**Regression risk:** High because two clipboard paths can behave differently.

**Next action:** Remove the local clipboard path after routing editor copy/paste through one validated, versioned clipboard format.

## 18. Autosave, Offline and Recovery

**Implemented**

- `IMPLEMENTED`: 1.2-second debounced draft save and expected revision in the publishing service.
- `PARTIAL`: A localStorage pre-save backup and in-memory publication recovery points exist.

**Missing**

- `MISSING P0`: IndexedDB/local draft database, crash-start recovery, corrupted-draft quarantine, recovery UI, retry queue, and conflict-resolution UI.
- `MISSING P1`: Write-ahead log and offline editing.
- `PARTIAL P0`: Optimistic revision is atomic only when production RPCs exist; the fallback is process-serialized legacy writing.

**Technical debt / bottleneck**

- The local backup is removed on success but is never read/restored.
- Recovery points disappear on reload because `PublicationRecoverySystem` stores them in a process-memory `Map`.

**Regression risk:** Critical for merchant data trust.

**Next action:** Add durable local recovery and explicit conflict handling before public beta.

## 19. Publishing Architecture

**Implemented**

- `IMPLEMENTED`: Separate draft/published fields, serialized publishing service, expected revision, atomic RPC path, publication-history RPC methods, tagged cache invalidation, and draft preview query.
- `IMPLEMENTED`: Theme policy keeps draft diagnostics advisory and blocks publish when production errors remain.

**Partial or missing**

- `PARTIAL P0`: Immutable publication snapshots and atomic revision switch exist in local SQL, but remote deployment is unverified.
- `MISSING P0`: Build compiler/artifact manifest, incremental compilation, publish queue, deployment logs, domain/SSL workflow, CDN asset manifest, and rollback UI using durable history.
- `PARTIAL P0`: Preview URL supports `?preview=draft` for an owner, but no password-protected share preview.
- `MISSING P1`: Scheduled publishing.
- `PARTIAL P0`: Cache invalidation exists in process abstractions but no CDN deployment configuration is present.

**Important policy distinction**

Draft design diagnostics remain advisory so merchants can save incomplete work. Publication blocks security, schema integrity, broken runtime dependencies, commerce integrity, and required accessibility errors.

**Regression risk:** Critical until remote migration and profile-state verification pass.

**Next action:** Certify the RPC path in staging/production, expose durable rollback, and then remove legacy compatibility fallbacks.

## 20. Storefront Runtime Separation

**Implemented**

- `IMPLEMENTED`: Public storefront uses `StorefrontRuntime`/`SceneRenderProvider`, not editor chrome.
- `IMPLEMENTED`: `verify:public-bundle` passed across 24 reachable chunks.
- `IMPLEMENTED`: Public rendering is read-only and has a renderer registry plus section/runtime error boundary.

**Partial or missing**

- `MISSING P0`: SSR/static rendering and hydration certification.
- `PARTIAL P0`: Runtime compatibility relies on current Scene Graph/theme shape without a real project migration policy.
- `MISSING P1`: Runtime feature-flag service.
- `PARTIAL P0`: Error boundaries hide/fallback locally but report only to `console.error`.

**Technical debt / bottleneck**

- `Store.tsx` is approximately 1,380 lines and combines data load, realtime refresh, navigation, page content, runtime layout, and styling.

**Regression risk:** Medium-high. Bundle isolation is verified; data/version/SEO behavior is not.

**Next action:** Keep isolation, split orchestration by responsibility, and add server-rendered/crawlable storefront delivery.

## 21. Performance Architecture

**Implemented**

- `IMPLEMENTED`: RAF transform previews, per-node preview versions, memoized `RenderNode`, lazy route/theme chunks, Vite chunk splitting, and cached paginated storefront reads.
- `IMPLEMENTED`: Interaction preview is outside persisted scene state.

**Partial or missing**

- `PARTIAL P0`: Visibility/culling code exists but `SceneRenderProvider` defaults it off and `StorefrontRuntime` does not enable it.
- `MISSING P1`: Layer virtualization and worker-based heavy operations.
- `PARTIAL P0`: Selective Zustand subscriptions exist, but `CanvasShell` force-renders on renderer invalidation and UI code also subscribes directly to many stores.
- `PARTIAL P0`: Renderer diffing is React reconciliation plus node subscriptions, not a measured incremental render scheduler.
- `MISSING P0`: Defined and enforced budgets for editor FPS, input latency, save latency, memory, node count, and storefront Web Vitals.
- `MISSING P1`: Memory-leak detection.

**Additional bottlenecks**

1. Full Scene Graph clone and full validation per mutation.
2. Full hit-test index rebuild per node event.
3. Full-document `JSON.stringify` plus node scans for theme policy audits.
4. Embedded base64 assets inflate clone/save/publish work.
5. Full-scene history snapshots for scene replacement.
6. Global singleton systems prevent isolated lifecycle/disposal.
7. No browser profiler evidence for 5k/20k-node policy limits.

**Regression risk:** High as document size grows.

**Next action:** Establish benchmarks, then implement incremental scene validation/indexing, asset indirection, culling, and scoped system disposal.

## 22. Error Handling and Observability

**Implemented**

- `IMPLEMENTED`: Scene and extension error boundaries prevent selected rendering crashes from taking down the whole application.
- `PARTIAL`: User toasts handle some save/publish failures.

**Missing**

- `MISSING P0/P1`: Central error-code registry, structured logging, correlation IDs, client reporting, performance monitoring, publish diagnostic timeline, error dashboard, safe mode, and defined degradation policies.

**Technical debt**

- Client and Edge Function failures are primarily `console.error`.
- Some Edge Functions log upstream response bodies.

**Regression risk:** Critical operationally; production failures will be difficult to diagnose or correlate.

**Next action:** Add telemetry and redaction before beta traffic, with explicit editor/publish/checkout traces.

## 23. Collaboration and Permissions

**Implemented**

- `IMPLEMENTED`: User authentication and owner-based dashboard access.
- `PARTIAL`: Local SQL defines `store_members`, roles, and capabilities.

**Missing**

- `MISSING P0`: Active application permission matrix on every mutation, member-management UI, activity log, and immutable audit trail.
- `MISSING P1`: Comments, mentions, approval workflow, and draft locks.
- `MISSING P2`: Concurrent editing and presence.

**Evidence**

The generated Supabase TypeScript types do not include the new `store_members`/domain tables, and source application code does not consume them.

**Regression risk:** Critical for multi-user stores.

**Next action:** Regenerate types after deployment and route every domain mutation through server-enforced capabilities.

## 24. Accessibility System

**Implemented**

- `PARTIAL`: Semantic text tags, alt-text fields/policy diagnostics, ARIA labels, focus-visible controls, mobile-menu keyboard tests, and reduced-motion handling for selected animation/menu paths.

**Missing or incomplete**

- `MISSING P0`: Heading hierarchy validator, live contrast checker, touch-target validator, universal ARIA governance, keyboard-only editor certification, and automated accessibility test suite.
- `PARTIAL P0`: Alt-text diagnostics are advisory while drafting and block publication, but they are not yet a complete asset/page audit.
- `PARTIAL P0`: Reduced-motion behavior is not governed globally.
- `MISSING P0`: Dedicated accessibility issues panel/publish preflight.

**Regression risk:** High legal and usability risk.

**Next action:** Add automated axe/browser checks plus editor diagnostics; block only genuine accessibility/runtime hazards, not visual creativity.

## 25. SEO System

**Implemented**

- `PARTIAL`: Store/page slugs and custom-page collision avoidance exist.
- `IMPLEMENTED`: A permissive `robots.txt` exists.

**Missing**

- `MISSING P0`: Per-store/page/product title, description, canonical, index controls, and crawlable rendering.
- `MISSING P0`: Product/organization/breadcrumb JSON-LD, sitemap generation, redirect manager, and image-alt SEO audit.
- `MISSING P1`: Broken-link scanner and editable social preview.

**Evidence**

`index.html` contains one Storeblink title/description/OG image for every route and includes mojibake in the title. The app uses client-only `BrowserRouter`.

**Regression risk:** Critical for merchant discoverability.

**Next action:** Add storefront-aware server/prerendered metadata and sitemap/structured-data pipelines.

## 26. Analytics and Events

**Implemented**

- `PARTIAL`: An internal engine event bus exists for editor system coordination. This is not merchant analytics.

**Missing**

- `MISSING P0`: Storefront commerce event contract and consent-aware tracking.
- `MISSING P1`: Provider abstraction, merchant dashboard, conversion funnel, editor usage analytics, and privacy/consent manager.
- `MISSING P0`: Explicit separation and governance between editor telemetry and storefront visitor analytics.

**Regression risk:** Medium for functionality, high for operating and improving a commerce platform.

**Next action:** Define a privacy-aware event schema only after the real checkout lifecycle exists.

## 27. Theme Architecture

**Implemented**

- `IMPLEMENTED`: Strict manifest validation, capability declarations, automatic package discovery, lazy package loading, platform/development/signed provenance model, runtime renderer resolution, theme-switch planning, and policy/certification-style unit tests.
- `IMPLEMENTED`: Basic, Atelier, and Noir Chrono packages are active.

**Partial or missing**

- `PARTIAL P0`: Theme installation/version/publication tables exist in SQL but are not the active editor lifecycle source.
- `PARTIAL P0`: Upgrade/migration engine has planning/backups, but real themes remain schema 1 and migration UI/recovery content UI are missing.
- `MISSING P0`: Merchant rollback UI and full certification suite across browser/responsive/accessibility/performance.
- `PARTIAL P1`: Signed-package verification API exists, but no configured trust service/key lifecycle is present.
- `MISSING P1/P2`: Security scanning pipeline, marketplace, demo-data lifecycle, and complete preview presets.

**Technical debt**

- Empty `src/themes/threadtemplate` directory remains.
- Legacy template naming is reconciled to Basic, which can confuse merchant expectations and audit trails.

**Regression risk:** Medium-high for upgrades; current built-in loading is comparatively strong.

**Next action:** Connect installed theme versions to persisted domain state and certify an actual v1-to-v2 migration/rollback.

## 28. Extension and App System

**Implemented**

- `IMPLEMENTED`: Named extension slots, page/store/product context, trusted provenance checks, maximum extension count, and React error boundaries.

**Partial or missing**

- `MISSING P0`: Permission scopes, process/iframe sandbox, app API version negotiation, rate limits, and data-access mediation.
- `MISSING P1`: App block schema, lifecycle/install/update/uninstall, cleanup, and webhooks.
- `PARTIAL P0`: Failure isolation catches React rendering errors, but extensions execute in the same JavaScript/DOM/security context.

**Regression risk:** Critical if third-party code is enabled.

**Next action:** Do not expose external extension installation until a sandboxed, permissioned host API exists.

## 29. Security Systems

**Implemented**

- `PARTIAL`: Supabase RLS migrations, owner/store-member helpers, upload type/size checks, SVG upload sanitizer, URL link resolver, and built-in package trust checks.

**Missing or unsafe**

- `UNVERIFIED P0`: Tenant isolation/RLS deployment and policy behavior in the real project.
- `PARTIAL P0`: Authorization exists in SQL/auth routes, but new capability tables are not integrated throughout the application.
- `FAILED P0`: Persisted SVG markup can bypass sanitization and enter `dangerouslySetInnerHTML`.
- `MISSING P0`: CSP/security-header deployment config and complete URL protocol governance.
- `MISSING P0`: Application-level rate limits/quotas for AI Edge Functions.
- `PARTIAL P0`: Edge Function code uses permissive CORS and does not itself call `auth.getUser()` or enforce tenant/quota. Platform JWT settings may still gate requests, but that is not evidenced in this checkout.
- `FAILED P0`: Six dependency advisories remain.
- `MISSING P0`: Security audit log, backup/restore drill, anomaly monitoring, and secret-rotation/runbook.
- `PARTIAL P0`: `.env` contains public Vite configuration and is not ignored. These current values are designed to be public, but the repository policy risks future secret commits and has no `.env.example`.

**Regression risk:** Critical.

**Next action:** Close stored-XSS and order-integrity issues, validate RLS remotely, add headers/rate limits/audit logs, and clear dependency advisories.

## 30. Testing Systems

**Implemented**

- `IMPLEMENTED`: 69 unit/component test files and 264 tests cover core scene, command, geometry, selection, transform math, responsive behavior, themes, publishing services, and selected UI.

**Failed or missing**

- `FAILED P0`: Current suite has one failure.
- `MISSING P0`: Real pointer interaction E2E, editor E2E, storefront/checkout E2E, visual regression, responsive screenshot, accessibility automation, performance regression, and supported-browser matrix.
- `PARTIAL P0`: Migration tests cover theme-system units, not production profile fixtures or remote database migration.
- `MISSING P1`: Property-based testing and fault injection.
- `MISSING`: CI that enforces any gate.

**Regression risk:** Critical. Unit coverage cannot prove drag/resize/caret/menu/storefront behavior in actual browsers.

**Next action:** Add CI and browser suites around the highest-risk workflows before adding more isolated UI features.

## 31. Editor UX Systems

**Implemented**

- `IMPLEMENTED`: Core keyboard shortcuts, pointer/hand modes, canvas tool dock, context toolbar, templates/layers/insert panels, toast system, inspector controls, responsive switcher, save state, loading/error states, and selected confirmation dialogs.
- `PARTIAL`: Multi-selection inspector supports shared transforms/properties through selected workflows.

**Partial or missing**

- `MISSING P1`: Command palette, global editor search, onboarding/guided tour.
- `PARTIAL P0`: Context actions exist in floating/inspector controls, not a complete right-click context menu.
- `PARTIAL P0`: Property schema renderer exists at infrastructure level, but active inspectors remain mostly hand-authored.
- `PARTIAL P0`: Unsaved save state exists, but there is no robust route-close/browser-close guard tied to durable recovery.
- `MISSING P0`: Responsive, publish, and accessibility issue panels.
- `MISSING P1`: Inspector pinning and complete mixed-property multi-edit.

**Technical debt / bottleneck**

- `EngineEditor.tsx` is 2,092 lines and owns loading, saving, templates, pages, sections, navigation, assets, clipboard, keyboard, inspector data, and layout.
- It imports systems and document stores directly despite using `EngineContext`.

**Regression risk:** High because unrelated editor behavior converges in one component.

**Next action:** Move orchestration behind EngineContext facades and schema-driven panels without redesigning the current UI.

## 32. Global Workflow Connection

The requested ideal workflow is not yet universal:

```text
User action
-> permission check
-> command/transaction
-> schema validation
-> preview or document mutation
-> dependency recalculation
-> responsive validation
-> history
-> local recovery
-> autosave
-> observability
-> publish preflight
```

Current breaks:

| Workflow | Status | Bypass |
|---|---|---|
| Transform | `PARTIAL/STRONG` | Preview and command lifecycle are good; permission, dependency, recovery, and telemetry stages are absent. |
| Inspector properties | `PARTIAL` | Commands are common, but inspector/UI imports stores/systems directly and schemas are incomplete. |
| Image replacement | `FAILED CONTRACT` | Inspector uses FileReader directly instead of AssetSystem validation/library. |
| Clipboard | `FAILED CONTRACT` | Active editor uses local React clipboard rather than the persistence clipboard system. |
| Page/theme/section operations | `PARTIAL` | Often use full scene-replacement commands and direct orchestration in `EngineEditor`. |
| Navigation/product binding | `PARTIAL` | Command-backed in selected paths, but no dependency graph or universal schema validation. |
| Save/publish | `PARTIAL` | Revision service exists; recovery, remote verification, observability, and durable preflight are incomplete. |
| SEO/forms/apps | `MISSING` | No full subsystem to join the workflow. |

The most important architecture weakness is not a missing toolbar. It is that system ownership is declared but not consistently enforced:

- `CanvasShell` directly imports global selection, transform, hit-test, renderer, viewport, scene adapters, and Zustand stores.
- `EngineEditor` imports command/history, Supabase, publishing, resolver, page, navigation, responsive, asset, and scene stores.
- Global singleton systems are registered into each new kernel, so the kernel does not truly own their lifecycle.

## 33. Additional Bottlenecks and Weaknesses Found

These findings were not adequately represented by "feature present/missing" checks:

1. **False commerce affordances:** Buy Now and cart links navigate to query parameters with no cart/checkout surface.
2. **False form success:** Contact UI confirms receipt even though nothing is sent or stored.
3. **Fabricated product proof:** Ratings, reviews, sold counts, and discounts are deterministic mocks shown to public visitors.
4. **Remote architecture drift:** Advanced domain SQL exists locally, generated frontend types are stale, and the project is not linked for migration verification.
5. **Legacy public fallback:** Compatibility code can serve legacy `theme`, preventing a provable published-only contract.
6. **Single-instance engine assumption:** Kernel construction reuses module-global systems/history, risking cross-editor/test state leakage.
7. **O(N) mutation pipeline:** Whole-tree clone, validation, policy scan, and hit-index rebuild make declared 5k/20k-node limits unsubstantiated.
8. **Embedded asset amplification:** Base64 images multiply memory, history, local backup, network, and JSON policy-scan cost.
9. **No deployment source of truth:** No CI, hosting config, security headers, environment template, release checklist, or rollback runbook.
10. **No Git metadata in the checkout:** Change provenance, release tags, and diff-based auditability cannot be verified here.
11. **Source-tree archives:** Three transform ZIP archives are stored under `src/interaction`, adding dead artifacts to the application source tree.
12. **Brand/release residue:** `README.md` is a Lovable placeholder; `index.html` and selected copy still identify Storeblink/demo behavior.
13. **Outdated browser data:** Build/test report `caniuse-lite` as 13 months old.
14. **Route maintenance ambiguity:** `/dashboard` is declared twice, once as a direct Overview route and again as a layout parent.
15. **No merchant-grade currency model:** Storefront helpers and dashboards assume USD.
16. **No catalog truth for reviews/discounts:** Product schema lacks the displayed proof fields.
17. **Advisory policy is overloaded:** Design freedom and security integrity need separate policy classes so nonblocking design rules never weaken hard safety checks.
18. **Public runtime culling is dormant:** Visibility support exists but is not enabled by `StorefrontRuntime`.

## 34. Professional Verdict and Prioritized Remediation Plan

### Release Block 1: Security and data truth

1. Sanitize/type all SVG scene input and add stored-XSS fixtures.
2. Remove mock public discount/rating/review/sold values.
3. Stop confirming contact submissions until a real endpoint exists.
4. Upgrade vulnerable dependencies and make tests/lint green.
5. Add CSP/security headers and application telemetry.

### Release Block 2: Database and publish certainty

1. Link a non-production Supabase project and validate every migration/RLS policy.
2. Regenerate Supabase types and integrate or remove unused domain scaffolding.
3. Migrate and verify all existing Engine Scenes with backups.
4. Prove atomic draft/publish/recovery and then remove legacy public/write fallbacks.
5. Build durable local recovery and rollback UI.

### Release Block 3: Real commerce

1. Implement product edit, variants, inventory, and collection entities.
2. Implement server-owned cart/checkout pricing and inventory reservation.
3. Integrate a real payment provider with idempotency/webhook verification.
4. Add shipping, tax, discounts, order confirmation, fulfillment, cancellation, and refunds.
5. E2E-test success, decline, retry, duplicate, out-of-stock, and webhook replay.

### Release Block 4: Editor platform contracts

1. Add per-node schema/version/capability registry and project migrations.
2. Make kernel instances own systems/history; remove UI singleton/store bypasses.
3. Add generic layout/constraints and semantic responsive intent.
4. Add components/instances/overrides and dependency tracking.
5. Replace full-tree hot-path work with incremental updates and measured budgets.

### Release Block 5: Public delivery

1. Add crawlable storefront rendering, metadata, JSON-LD, sitemap, canonical, and redirects.
2. Add CI/CD with migrations, unit, browser, visual, accessibility, performance, and security gates.
3. Add production dashboards, alerts, runbooks, backups, and restore drills.
4. Run an invite-only staging beta before accepting real payments.

---

# Final Launch Readiness

The score below evaluates readiness for a **public production commerce launch**, not whether the editor can be demonstrated.

| Area | Weight | Current completion | Weighted result |
|---|---:|---:|---:|
| Editor/document core | 18% | 60% | 10.80 |
| Interaction/layout/responsive | 15% | 55% | 8.25 |
| Themes/pages/assets/editor UX | 12% | 52% | 6.24 |
| Public storefront/content runtime | 10% | 55% | 5.50 |
| Commerce/forms/orders/payments | 18% | 10% | 1.80 |
| Persistence/publishing/data integrity | 12% | 35% | 4.20 |
| Security/accessibility/SEO/privacy | 8% | 20% | 1.60 |
| QA/performance/observability/release operations | 7% | 15% | 1.05 |
| **Total** | **100%** |  | **39.44%** |

## Honest Progress

**Production public-commerce launch readiness: 39% complete.**

**Distance remaining: 61%.**

Confidence range: approximately +/-5 percentage points because the production Supabase schema, all existing profile migrations, real browser interactions, and deployment environment are currently unverified.

The current code is suitable for continued internal development and a controlled editor/storefront demonstration after the red local gates are fixed. It is not suitable for accepting public production orders or merchant-critical data. The score will not move materially through more templates or inspector controls; it will move through secure checkout, verified migrations, durable recovery, browser certification, SEO delivery, and production operations.
