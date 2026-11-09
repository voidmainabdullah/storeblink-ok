# StoreBlink Auth, Authorization and Asset Platform - Start Audit

Date: 2026-08-01

## Implemented ✓

- One existing browser Supabase client is configured with native session persistence and automatic token refresh.
- Email/password sign-up and sign-in screens exist and the visual design can be preserved.
- Basic route guards prevent unauthenticated access to dashboard and onboarding screens.
- `profiles`, `stores`, and `store_members` migrations exist, with legacy owner records backfilled into the store domain.
- Existing merchant tables have baseline owner RLS policies and public storefront reads use narrow RPCs where the newer domain migration is available.
- A Scene Graph `AssetSystem` already owns stable asset IDs, intrinsic dimensions, SVG sanitization, and the root asset-library extension.

## Missing ✗

- Merchant authentication is not isolated from `/store/*`; `AuthProvider` currently wraps the complete public and private route tree.
- There is no AuthService, SessionManager, typed auth error mapper, dashboard bootstrap, membership-revocation response, or capability-aware route/action guard.
- Components call Supabase Auth directly and expose raw backend error messages.
- MFA enrollment/challenge and AAL2 step-up support are absent.
- Turnstile token plumbing and rate-limit-specific UX errors are absent.
- There is no `assets` metadata table or store-scoped storage authorization model.
- Four production upload paths bypass the Asset System through `FileReader` data URLs or direct Storage calls.
- Persisted Scene Graph asset records contain binary data URLs instead of durable storage references.
- Large upload progress, cancellation, retry, TUS resume, immutable paths, metadata finalization, and failed-upload cleanup are absent.
- No automated contract proves that public storefront routes have zero merchant session/bootstrap requests.

## Partially Implemented △

- `store_members` has role/capability columns, but its role vocabulary, status lifecycle, capability set, helper schema, and application consumption do not meet the new contract.
- Store-scoped RLS exists in the future-domain migration, but legacy owner-only policies and compatibility RPCs still bypass membership capabilities in several mutations.
- Legacy public image buckets use user-ID folders and inconsistent SELECT policies; they are not the required public/private bucket strategy.
- The Scene Graph already references some assets by ID, but `ImageAssetRecord.originalSource` still embeds the binary and several image nodes still persist raw `src` values.
- Public storefront data reads are narrow and paginated, but generated Supabase types do not include the newer store-domain tables and remote migration state is unverified.

## Technical Debt

- Auth state, profile reads, onboarding checks, and store ownership are independently fetched by page components.
- The original owner-equals-user model remains a compatibility dependency across products, orders, notifications, publishing, and onboarding.
- `EngineEditor` still coordinates upload UI and Scene Graph mutation, so its upload callback must be migrated without moving editor business logic into React components.
- Existing test fixtures deliberately contain data URLs and must be converted to durable asset-reference fixtures without weakening SVG boundary tests.
- The checked-in Supabase type file predates store-domain and asset tables.

## Regression Risk

- High: changing router/provider boundaries can break dashboard refresh persistence or accidentally expose draft reads on public routes.
- High: replacing embedded images can break existing scenes unless legacy data URLs remain readable during a bounded migration period.
- High: storage policies can deny valid uploads or permit cross-store writes if path and membership checks diverge.
- Medium: capability enforcement can block existing owner workflows if owner bootstrap/backfill is incomplete.
- Medium: immutable asset replacement can orphan old objects without an explicit lifecycle and cleanup state.

## Next Actions

1. Introduce one canonical Supabase client and a dashboard-only AuthProvider backed by AuthService and SessionManager.
2. Add typed capabilities, dashboard bootstrap caching, membership revocation handling, route guards, MFA step-up primitives, and normalized errors.
3. Add a private authorization schema, store membership lifecycle, optimized RLS helpers/policies, dashboard bootstrap RPC, assets table, buckets, and storage policies.
4. Evolve the existing Asset System record into a storage-reference manifest and add one AssetManager upload/finalization pipeline.
5. Migrate every confirmed upload bypass while preserving legacy data-URL rendering only for existing documents.
6. Add unit, integration, RLS contract, and browser-route tests; run all repository gates and verify the migration against a linked non-production project before claiming production completion.

