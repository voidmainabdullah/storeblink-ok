# Custom Code and Storefront Readiness Audit

## Phase Start

### Implemented

- Scene Graph accepts versioned `custom:*` nodes.
- Renderer Registry can bind an exact custom node type.
- Command, history, selection, transform, responsive overrides, persistence, and publishing already operate on custom nodes.
- Basic, Atelier, Threadtemplate, and Noir Chrono are discoverable Engine themes.
- Public catalog, product routes, cart state, and merchant order tables exist.

### Missing

- No safe custom React, TypeScript, JavaScript, or CSS authoring runtime.
- No custom-code inspector or insert action.
- No certified browser journey covering mobile navigation through COD confirmation.
- No shared production gate that verifies every published theme at all supported widths.

### Partially Implemented

- Theme scenes carry responsive overrides, but browser-level fit and interaction coverage is incomplete.
- Mobile menu infrastructure exists, but theme content and action wiring have varied by template.
- Product cards and carts exist, but some template controls are decorative or route-specific.
- Responsive diagnostics identify geometry issues but do not prove final storefront behavior.

### Technical Debt

- Home Scene Graph pages and generic secondary pages use two rendering compositions.
- Theme-specific absolute geometry requires stronger automated viewport contracts.
- The legacy editor remains in the repository and contains an unscoped postMessage listener, although it is not the active dashboard route.

### Regression Risk

- Merchant code must not gain access to auth, storage, Supabase, or parent DOM state.
- Fixes must preserve custom-domain path remapping and published-only storefront reads.
- Shared mobile fixes must not alter desktop Scene Graph geometry.
- Checkout must remain server-priced, atomic, idempotent, and COD-only.

### Next Actions

1. Implement a sandboxed, precompiled `custom:code` node.
2. Add Independent-mode source editing and insertion controls.
3. Repair shared mobile chrome and certify each Engine theme at production widths.
4. Verify product view, add-to-cart, cart review, and COD placement.
5. Record phase-end evidence and unresolved production risks.

## Phase End

### Implemented

- `custom:code` is a first-class Scene Graph node rendered through the Renderer Registry.
- The custom-code contract accepts TypeScript/TSX or JavaScript/JSX plus scoped CSS, compiles with Sucrase, and runs React-compatible Preact components in a sandboxed iframe.
- The iframe has no same-origin privilege and a restrictive CSP; catalog/store data and approved storefront actions cross a typed bridge only.
- Independent mode exposes source editing and insertion. Fixed mode keeps structural and source mutations blocked while allowing approved content edits.
- Custom nodes inherit selection, transform, responsive overrides, command history, layers, persistence, and publish behavior from the Engine.
- Theme readiness diagnostics validate Basic, Atelier, and Noir Chrono at 1440, 768, and 390 pixel widths.
- Noir Chrono mobile navigation, published catalog hydration, product routes, cart review, and COD checkout are wired to shared production systems.
- Public storefront routes no longer import authenticated preview or editor interaction dependencies. Dashboard preview injects its authenticated loader at the route boundary.

### Missing

- Arbitrary npm imports, remote scripts, network access, Node APIs, and JVM Java are intentionally unavailable inside merchant code because they violate the storefront sandbox boundary.
- A real production customer order was not placed during automated verification; the browser suite uses deterministic network fixtures.

### Partially Implemented

- Noir Chrono has full browser journey coverage. Basic and Atelier pass structural viewport diagnostics but do not have equivalent customer-journey browser suites.
- Secondary storefront pages use the shared responsive shell rather than rendering every page as a fully authored theme Scene Graph.
- Performance is protected by route chunk isolation, renderer invalidation, and sandbox boundaries, but no device-lab frame-time profile was captured.

### Technical Debt

- `Store.tsx` remains a large composition root for public pages, cart integration, theme hydration, and route rendering.
- Absolute authored theme geometry still requires per-theme viewport fixtures when a new theme is introduced.
- The inactive legacy editor remains in the repository and must stay excluded from active routes until its compatibility consumers are removed.

### Regression Risk

- Route composition can accidentally pull auth/editor code back into storefront chunks; `npm run verify:public-bundle` is the release guard.
- Merchant bridge actions must remain allow-listed and source-node validated.
- COD migrations and database deployment can drift from the tested client contract.

### Verification

- `npm run test -- --pool=forks --poolOptions.forks.singleFork=true`: 121 files, 434 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- `npm run verify:themes`: 9 theme/viewport combinations passed with zero blockers.
- `npm run verify:public-bundle`: 30 reachable public chunks passed isolation checks.
- `npx playwright test tests/e2e/noir-chrono-storefront.spec.ts`: 2 browser journeys passed.
- `npm audit --audit-level=high`: zero vulnerabilities.

### Next Actions

1. Run a production smoke order on a published Noir store and verify it appears in merchant Orders.
2. Add equivalent browser journeys before declaring Basic or Atelier production-final.
3. Capture mid-tier mobile frame timings if formal 60 FPS certification is required.
