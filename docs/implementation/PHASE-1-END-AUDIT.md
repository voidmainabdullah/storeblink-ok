# Phase 1 End Architecture Audit

Date: 2026-08-01

Status: Locally implemented and verified. Deployment enforcement and the upstream React Router exception still require release-time review.

## Implemented (PASS)

- Added one allow-list SVG security pipeline in `engine/validation/safeSvg`.
- Added a versioned `SafeSvgModel` with normalized dimensions, aspect ratio, and branded sanitized markup.
- Enforced limits for source bytes, element count, attributes, attribute length, and dimensions.
- Removed scripts, event handlers, style attributes, `foreignObject`, iframes, unsafe protocols, external resources, and non-local URL references.
- Revalidated SVG at scene validation/import, clipboard, persisted asset load, custom theme icon, and final renderer boundaries.
- Converted legacy `props.markup` SVG nodes into the typed `props.svg` model during validation.
- Removed generated ratings, reviews, sold counts, fallback discounts, fake scarcity, and unsupported trust claims from the public product path.
- Compare-at discount, stock state, merchant badge, sale timing, and free-delivery labels now render only from persisted catalog fields.
- Replaced the non-functional contact submission with a truthful unavailable state; no false success and no destructive form reset remain.
- Removed fake default KPI/customer-proof content from the dormant minimal section module.
- Fixed palette case normalization coverage and all ESLint errors.
- Fixed all reported React hook dependency warnings without suppressing them.
- Updated React Router to 7.18.2, Vite to 6.4.3, `caniuse-lite` to 1.0.30001806, and Browserslist to 4.28.7.
- Added deployable `_headers`, CSP/HSTS/frame protections, and an automated header gate.
- Added an explicit, expiring production-audit policy for the sole upstream RSC-only advisory.

## Verification

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | Pass |
| `npm run test -- --maxWorkers=1` | Pass: 71 files, 272 tests |
| `npm run lint` | Pass: 0 errors; 20 Fast Refresh boundary warnings |
| `npm run build` | Pass: Vite 6.4.3, 2,235 modules transformed |
| `npm run verify:public-bundle` | Pass: 24 reachable chunks isolated |
| `npm run verify:security-headers` | Pass: 6 headers and 7 mandatory CSP directives |
| `npm run verify:production-audit` | Pass with one reviewed exception expiring 2026-09-01 |
| Public fake-proof scan | Pass: no matching public claims remain |

## Missing (FAIL)

- Security-header enforcement has not been tested against the actual production CDN/host response.
- A server-backed contact pipeline, rate limiting, spam protection, storage, and merchant notification do not exist; the UI therefore remains intentionally unavailable.
- There is no browser E2E security test proving CSP behavior in the deployment environment.

## Partially Implemented (PARTIAL)

- Raw `npm audit --omit=dev` reports `GHSA-qwww-vcr4-c8h2` through `react-router` and `react-router-dom`. It affects RSC server actions, which StoreBlink does not import or ship. The automated policy rejects version drift, RSC/server API introduction, every other advisory, and expires on 2026-09-01.
- Twenty `react-refresh/only-export-components` warnings remain. They affect development hot reload boundaries, not production runtime correctness; splitting those modules is deferred to a dedicated file-boundary cleanup.
- SVG sanitization currently relies on browser `DOMParser`/`XMLSerializer`. A future server ingestion path must use equivalent server-side parsing before accepting SVG uploads.

## Technical Debt

- Image `FileReader` ingestion remains distributed across inspector and element adapters.
- The security header file supports hosts that honor static `_headers`; every deployment adapter must map the same policy.
- Product/contact domain operations are not yet server-authoritative.

## Regression Risk

- Low: all 272 unit/component tests and the production build pass after the dependency upgrades.
- Low: SVG is sanitized twice at persisted ingestion and final DOM rendering, with malformed payloads rendered as inert placeholders.
- Medium: strict CSP can require an explicit allow-list update if a future asset/CDN, payment provider, or embedded media host is introduced.
- Medium: React Router advisory policy must not be allowed to expire silently.

## Next Actions

1. Begin Phase 2 by replacing module-global history/system instances with kernel-owned instances.
2. Introduce typed kernel facades so active UI stops importing singleton systems.
3. Add multi-kernel isolation tests before claiming Phase 2 completion.
4. Verify `_headers` against the chosen production host before public launch.

