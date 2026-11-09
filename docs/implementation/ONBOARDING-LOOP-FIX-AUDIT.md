# StoreBlink Onboarding Loop Fix - Architecture Audit

Date: 2026-08-10

## Start Audit

### Implemented ✓

- Auth session initialization and dashboard authorization bootstrap already use
  `AuthProvider`, `SessionManager`, and `PermissionService`.
- Dashboard routes are protected by `OnboardingGate` and require the persisted
  `onboarding_completed` flag.
- The local schema defines profile, store, membership, trigger provisioning,
  and the narrow `get_dashboard_bootstrap` authorization RPC.

### Missing ✗

- The linked Supabase project has no migration versions recorded, so the local
  auth, tenant, bootstrap, and onboarding schema is not deployed there.
- There is no atomic onboarding completion RPC and no guaranteed backfill for
  auth users created before tenant provisioning was installed.
- The client does not verify that authorization observes the completed state
  before presenting success and navigating to `/dashboard`.

### Partially Implemented △

- The onboarding page writes `profiles` directly. An update with no matching
  row can return no PostgREST error while changing zero rows.
- `refreshAuthorization()` is called after the write, but its nullable result is
  ignored. A stale or failed bootstrap therefore enters the gate redirect loop.
- Handle uniqueness is probed from the browser even though RLS prevents a
  merchant from reliably seeing other merchants' handles.

### Technical Debt

- Generated Supabase TypeScript types predate the auth and onboarding RPCs.
- Tenant provisioning currently exists in both a signup trigger and profile
  projection compatibility trigger; their invariants need one idempotent repair
  boundary for existing accounts.

### Regression Risk

- High until all ordered migrations are applied to the linked project.
- Medium around existing auth users without profile/store/member rows.
- Medium around duplicate requested store handles under concurrent onboarding.

### Verification Evidence

- `npm run verify:supabase`: the configured Auth endpoint is reachable.
- `npx supabase migration list --linked`: all 18 local migrations are absent
  from remote migration history before this fix.
- Static trace: `Onboarding.finish` accepts a zero-row update and ignores the
  nullable `refreshAuthorization()` result; `OnboardingGate` then redirects the
  user back whenever the bootstrap flag remains false or unavailable.

### Next Actions

1. Add an idempotent existing-user repair and atomic completion RPC.
2. Move onboarding persistence behind the auth platform boundary.
3. Require a freshly verified bootstrap before showing success or redirecting.
4. Add service, migration-contract, and route-loop regression coverage.
5. Apply and verify migrations against the linked Supabase project.

## End Audit

### Implemented ✓

- Added `complete_store_onboarding`, a security-definer RPC that validates all
  onboarding input, derives and serializes unique public handles, and commits
  profile, store, active owner membership, theme, categories, and completion in
  one database transaction.
- Added an idempotent migration backfill for auth users that predate profile,
  store, or membership provisioning. The linked user's missing tenant records
  were created during deployment.
- Replaced the page's direct `profiles.update(...).eq(...)` mutation with
  `OnboardingService` behind `AuthProvider`.
- Added runtime response validation and cross-tenant ID checks at the RPC
  boundary.
- A successful RPC is no longer enough to redirect. `AuthProvider` clears the
  authorization cache, reloads the exact returned store, and verifies the
  completed profile plus active matching membership before returning success.
- Background authorization refresh no longer unmounts an already bootstrapped
  screen. Authenticated onboarding and MFA routes can also recover from a
  missing tenant bootstrap instead of being blocked by a store-level error.
- Browser-side global handle probing was removed from onboarding; uniqueness is
  now enforced under a transaction-scoped advisory lock where all handles are
  visible.
- Added generated function signatures for onboarding and dashboard bootstrap,
  removing their unsafe RPC casts.
- Repaired linked migration history only after remote indexes/tables confirmed
  that migrations through `20260809000100` were already present, then deployed
  only `20260810000100_onboarding_completion.sql`.

### Missing ✗

- No implementation item remains missing.
- A real-session final click cannot be automated without the merchant's
  credentials/session. The deployed database and client path are ready; the
  current merchant must submit the final onboarding step once to persist the
  selected name, categories, and template.

### Partially Implemented △

- The repository-wide generated database types still do not enumerate every
  historical auth/asset/domain RPC. The two RPCs touched by this flow are now
  typed; full regeneration remains a separate schema-maintenance task.

### Technical Debt

- The 2.6-second onboarding splash intentionally delays navigation after the
  completion proof. It is presentation-only and no longer participates in the
  persistence or authorization contract.
- The compatibility profile-to-store projection trigger remains until the
  broader owner-profile projection migration is retired.

### Regression Risk

- Low for the onboarding loop: zero-row writes are gone, completion is atomic,
  and redirect requires a fresh matching bootstrap.
- Low for tenant repair: backfill and completion are idempotent and owner scoped.
- Medium operational risk remains if future schema changes are applied outside
  Supabase migration history; local and remote versions are aligned now.

### Verification Evidence

- `npm run test -- --maxWorkers=1` with a 4 GiB Node heap: 101 files and 381
  tests passed.
- Focused onboarding service/migration suite: 2 files and 6 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; 2,348 modules transformed.
- `npm run lint`: passed with zero errors and 25 pre-existing warnings.
- `npm run test:e2e -- tests/e2e/auth-platform.spec.ts`: 5 passed and the
  credential-gated staging-session test skipped.
- `npx supabase migration list --linked`: all 19 local and remote versions match.
- Remote generated schema exposes both `complete_store_onboarding` and
  `get_dashboard_bootstrap` with the expected arguments.
- Remote table statistics after backfill report one profile, one store, one
  active owner membership, one theme installation, and one theme document.
- `npx supabase db lint --linked --level warning`: onboarding RPC has no issue;
  one pre-existing warning remains in unrelated
  `assert_storefront_document_policy` volatility metadata.
- Development server is running at `http://localhost:8082`.

### Next Actions

1. Refresh `http://localhost:8082/onboarding`, keep or re-enter the desired
   choices, and submit `Create store` once.
2. Confirm the splash transitions to `/dashboard`; reloading `/dashboard`
   should remain there rather than redirecting back.
3. Configure the optional staging E2E credentials to automate the final
   real-session completion and persistence check in CI.
