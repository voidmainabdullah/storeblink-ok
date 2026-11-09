# Editor, Platform Admin, and Domain Access Repair - Architecture Audit

Date: 2026-08-10

## Start Audit

### Implemented ✓

- `/dashboard/store` already loads the active tenant through
  `EditorStoreDataService` and the narrow `get_editor_store_document` RPC.
- The linked store already has a valid version 2 Engine Scene with a root node
  and independently persisted scene nodes.
- Domain management is tenant scoped, capability guarded, and requires an AAL2
  session before `/domain/connect` is rendered.
- The domain platform already owns a private `platform_staff` role table and
  revokes merchant access to provider, credential, queue, and audit internals.

### Missing ✗

- The linked `items` table does not contain `sold_count`, although the editor's
  startup catalog query requires it. PostgREST therefore returns `42703` and
  prevents the valid Engine Scene from mounting.
- There is no `/main-admin` route, staff access RPC, or operational admin page.
- `abdullahx.ext@gmail.com` has no `platform_staff` assignment.
- The MFA enrollment screen does not explain how to scan its TOTP QR code, why
  domain access requires it, or what scanning and verification will change.

### Partially Implemented △

- Editor load errors are caught, but PostgREST error objects are not normalized
  to `Error`; the UI collapses the actionable database message into a generic
  "Could not load the Engine Scene editor" state.
- The database has the staff security foundation, but no browser-safe projection
  or staff-only aggregate boundary consumes it.
- Domain reset semantics exist through normal disconnect workflows. A one-time
  all-user reset is unnecessary at present because every live domain table has
  zero rows.

### Technical Debt

- Local generated database types include `items.sold_count` even though the
  linked schema does not, so static typing did not detect deployment drift.
- Full generated types do not yet enumerate the new domain administration RPCs;
  runtime validation is required at that boundary until types are regenerated.

### Regression Risk

- High for editor startup until the database column and client contract match.
- High if staff authorization is implemented only in React instead of being
  enforced again inside every privileged database function.
- High if a reset is shipped as a reusable migration, because it could erase
  future customer domain records during later deployments.

### Verification Evidence

- Authenticated browser reproduction reaches `/dashboard/store`, then receives
  HTTP 400 from `/rest/v1/items`.
- The exact live PostgREST response is SQLSTATE `42703`: column
  `items.sold_count` does not exist.
- `get_editor_store_document` succeeds for the same user and returns a valid
  Engine Scene, proving the renderer migration is not the failing boundary.
- Linked database table statistics report zero rows for all domain, DNS, SSL,
  registrar, Google, Search Console, event, and domain-job tables.
- Static route inspection confirms `/main-admin` is absent while
  `platform_staff` exists and is denied to `authenticated` table access.

### Next Actions

1. Repair the item schema with an idempotent migration and add a drift contract.
2. Preserve detailed PostgREST failures through the editor data boundary.
3. Add a database-enforced, AAL2-protected platform admin projection and route.
4. Grant the requested account an existing platform staff role and audit it.
5. Add contextual TOTP setup guidance for domain and admin access.
6. Deploy, then rerun live editor, authorization, domain-state, and build gates.

## End Audit

### Implemented ✓

- Added and deployed `20260810000200_editor_admin_domain_repair.sql` to the
  linked Supabase project. `items.sold_count` is now non-null, non-negative,
  defaults to zero, and has a store-scoped best-seller index.
- Added a reusable Supabase error normalizer. Plain PostgREST objects now retain
  their operation, SQLSTATE, and message instead of becoming the editor's
  generic fallback. The catch screen no longer incorrectly labels every load
  failure as an Engine Scene migration problem.
- The authenticated `/dashboard/store` runtime now loads the existing Engine
  Scene, template panel, CanvasShell, and inspector with no failed item request.
- Added `get_platform_staff_access`, a current-user-only staff projection, and
  `get_platform_domain_overview`, an AAL2 and active-staff protected aggregate.
  Neither function exposes provider credentials, OAuth state, or raw queues.
- Added an independently lazy-loaded `/main-admin` route, an authentication and
  AAL2 guard, a database-backed staff guard, and a responsive operations page
  with real cross-store domain, DNS, SSL, registrar, Google, and job counts.
- Granted `abdullahx.ext@gmail.com` the active `security_admin` role as
  operational data, outside schema migration, and recorded the assignment in
  `admin_audit_log`.
- Added context-specific MFA guidance for Domain Connect and Main Admin. New
  enrollment explains the supported authenticator apps, exact QR scan steps,
  manual setup key, why AAL2 is required, and what verification changes. It
  explicitly states that scanning does not connect DNS, purchase a domain, or
  create a charge.
- Existing-factor UI now explains that the QR code appears only during initial
  enrollment and asks for the current six-digit StoreBlink code instead.
- Verified every domain-system table with exact counts. All 14 tables contain
  zero rows, so the requested shared reset is complete without an unsafe delete.
  The clean reset proof is recorded in `admin_audit_log`.

### Missing ✗

- No requested implementation item remains missing.

### Partially Implemented △

- The final post-MFA `/main-admin` browser screen cannot be exercised without a
  current code from the account's already-enrolled authenticator. The staff
  projection succeeds live, AAL1 is denied by the overview RPC, the browser is
  redirected to MFA, and the production page/service are covered by tests and
  build output. The account holder must provide the existing code to complete
  that final human authentication step.
- Cloudflare, registrar, and Google provider transactions remain dependent on
  their separately documented production credentials and acceptance tests; no
  provider operation was added or changed in this repair.

### Technical Debt

- The checked-in generated Supabase type file still omits several historical
  domain and editor RPCs. New admin boundaries use explicit runtime Zod schemas
  and a narrow typed RPC adapter until a full generated-type refresh is scheduled.
- One existing database lint warning remains: `assert_storefront_document_policy`
  is marked immutable while containing a stable expression. The new migration
  introduced no SQL lint finding.
- Repository lint retains 25 pre-existing warnings in unrelated UI and hooks;
  there are zero lint errors and no new-file warning from this change.

### Regression Risk

- Low for editor startup: schema and query now match, the error boundary retains
  actionable failures, focused coverage protects `sold_count`, and a real
  authenticated browser loaded the editor with zero failed catalog responses.
- Low for platform access: authorization is enforced in both route guards and
  the security-definer RPC; merchant roles and AAL1 sessions cannot read the
  cross-store overview.
- Low for domain reset: exact live counts were zero and no destructive write or
  reusable data-wiping migration was executed.

### Verification Evidence

- Focused editor/admin/MFA/migration tests: 11 tests passed.
- Full suite with a 4 GiB Node heap and one worker: 104 files and 390 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with zero errors and 25 pre-existing warnings.
- `npm run build`: passed; 2,353 modules transformed and lazy Main Admin, guard,
  service, MFA, and editor data chunks were emitted.
- `npx supabase db push --linked`: deployed only
  `20260810000200_editor_admin_domain_repair.sql` successfully.
- Remote generated schema contains `items.sold_count`,
  `get_platform_staff_access`, and `get_platform_domain_overview`.
- `npx supabase db lint --linked --level warning`: no finding in the new
  migration; one pre-existing unrelated volatility warning remains.
- Live staff projection returns the requested email, active state, and
  `security_admin` role. The same AAL1 session receives HTTP 403 from the
  platform overview, proving database-side AAL2 enforcement.
- Authenticated Chrome smoke: `/dashboard/store` loaded the real editor with
  zero relevant failed responses; `/main-admin` redirected to its contextual
  MFA screen; `/domain/connect` rendered domain-specific security guidance.
- Visual evidence:
  `test-results/editor-repair-smoke.png` and
  `test-results/domain-mfa-guidance-smoke.png`.
- Exact live domain reset proof: zero rows across `store_domains`, DNS and SSL
  verification, Cloudflare, quotes, purchases, transfers, Google, Search
  Console, sitemap, metrics, events, and jobs.

### Next Actions

1. Open `/main-admin` and enter the current six-digit code from the already
   connected authenticator. The account will return to the real operations page.
2. Open `/domain/connect` the same way. For this enrolled account no QR is
   expected; new accounts receive the documented QR setup flow.
3. Regenerate the complete Supabase TypeScript schema in a dedicated maintenance
   change so all historical RPC declarations are aligned at once.
