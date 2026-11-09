# Phase 1 Start Architecture Audit

Date: 2026-08-01

## Implemented (PASS)

- SVG upload validation has a pre-existing asset ingestion boundary.
- Catalog records contain persisted compare-at price, badge, free-delivery, sale-tag, and sale-end fields.
- Storefront catalog reads use the public data resolver.
- TypeScript and production build passed at baseline.

## Missing (FAIL)

- No single typed Safe SVG model protects upload, import, paste, database load, migration, clipboard, and renderer boundaries.
- The contact form claims success while persisting and sending nothing.
- Deployment security headers are absent.
- The palette normalization test is failing.
- Lint contains three errors and relevant stale-closure warnings.

## Partially Implemented (PARTIAL)

- Product cards use real catalog fields for some badges, but generated ratings, sold counts, review counts, scarcity, and fallback discounts still appear in public UI.
- Dependency updates are available, but the baseline audit contains high/moderate advisories.
- SVG renderer can render stored markup, but it does not revalidate at the final DOM boundary.

## Technical Debt

- `dangerouslySetInnerHTML` is unavoidable for inline SVG rendering but must accept only branded, sanitized markup.
- Browser `DOMParser` is available in the current client runtime; server-side SVG processing will require an equivalent standards-based parser.
- Deployment host enforcement cannot be proven from source alone.

## Regression Risk

- High: sanitizer changes can remove legitimate SVG attributes or break theme icons.
- High: dependency major updates can affect routing and build output.
- Medium: removing fabricated commerce UI can change card density.
- Low: contact form replacement affects only a non-functional path.

## Next Actions

1. Add centralized allow-list SVG validation and a typed persisted model.
2. Revalidate SVG at clipboard, asset-library, scene-load, icon, and renderer boundaries.
3. Remove generated public commerce proof and false contact success.
4. Fix lint/test failures, update dependencies/browser data, and add security-header verification.
5. Run the complete local gate set before writing the Phase 1 end report.

