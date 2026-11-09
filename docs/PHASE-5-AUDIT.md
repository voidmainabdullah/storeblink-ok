# Phase 5 Architecture Audit Report - Start

Date: 2026-07-24

Scope: Transform System, Moveable integration, multi-selection, marquee selection, and snap foundation.

## Implemented ✓

- Command System existed with dispatch, field update, insert, delete, and transform command factories.
- Transform Store existed for live preview transforms.
- Selection Store already supported `selectedIds: NodeId[]`.
- Overlay layer existed and could host selected/group visuals.
- Hit Testing System exposed `hitTestRegion(rect)` for marquee selection.
- Snap foundation existed under `src/interaction/snap/computeSnap.ts`.

## Missing ✗

- Figma-style visible marquee selection rectangle styling.
- Reliable Selecto-to-SceneGraph region selection in the live canvas.
- Group bounding box for multi-selection.
- Figma-blue selection outlines, handles, rotation handle, and size badge.
- Text resize commit updating text font size.
- Public/root node exclusion from hit testing so page background opens page settings instead of being selected.

## Partially Implemented △

- Moveable was mounted, but visual styling and group feedback were not Figma-like.
- Multi-selection storage existed, but visual group feedback was incomplete.
- Transform preview existed, but text resize did not update text size.

## Technical Debt

- React Moveable still performs expected DOM measurement for handle placement; business hit testing remains Scene Graph based.
- Full Playwright drag/resize visual verification remains a future verification upgrade.

## Regression Risk

- Marquee drag can fight normal pointer selection if both flows handle the same gesture.
- Multi-selection can select parent and child together unless normalized.
- Text resize can produce detached boxes if font size is not committed with transform.
- Root/page selection can block page settings if root is eligible for hit testing.

## Verification Evidence

- Required before completion: hit-test root exclusion tests.
- Required before completion: transform preview/commit tests.
- Required before completion: text resize font-size test.
- Required before completion: Selecto region selection test through `hitTestRegion`.

## Next Actions

- Patch hit testing eligibility.
- Normalize multi-selection to avoid parent/descendant duplicates.
- Patch Selecto styling and event handling.
- Patch overlay group bounds and size badges.
- Patch transform command payload to support text prop updates during resize.
