# Domain Runtime CORS Repair - Architecture Audit

Date: 2026-08-10

## Start Audit

### Implemented ✓

- The domain client routes every merchant operation through `DomainService` and
  the `domain-orchestrator` Edge Function boundary.
- The local Edge Function handles `OPTIONS` before authentication or body
  parsing and returns origin-specific CORS headers for localhost ports 8080-8082.
- Domain UI already presents loading, retry, and sanitized error states.

### Missing ✗

- The linked Supabase project reports zero deployed Edge Functions. Browser
  requests therefore fail at the gateway before local CORS code can run.
- There is no regression contract proving localhost:8082 remains allowed and
  preflight handling remains ahead of authorization.

### Partially Implemented △

- Network failures are mapped to a safe domain error, but Supabase's
  "Failed to send a request to the Edge Function" transport message is not
  recognized and falls back to the less useful generic operation error.
- `Logo` owns an anchor while `DomainConnectLayout` wraps it in another anchor,
  producing invalid nested interactive markup and React's DOM nesting warning.

### Technical Debt

- `supabase/config.toml` still carries the retired project reference even though
  the CLI link points at `shflnrznleodviqphvfg`.
- Function deployment state is not currently checked by a repository command or
  CI release gate.

### Regression Risk

- High until `domain-orchestrator` is deployed and a real browser-origin
  preflight returns a successful status with the expected allow-origin header.
- Medium for domain diagnostics because transport failures currently lose their
  actionable service-unavailable classification.
- Low for the logo markup after all nested `Link` call sites are removed.

### Verification Evidence

- `npx supabase functions list --project-ref shflnrznleodviqphvfg` returns an
  empty function list.
- Browser console shows repeated failed preflight requests to
  `/functions/v1/domain-orchestrator` and the domain dashboard renders its error
  boundary.
- Source inspection confirms the local handler would return HTTP 204 for
  `OPTIONS`, proving deployment drift rather than handler ordering is the
  immediate CORS root cause.
- React's stack trace identifies `DomainConnectLayout > Link > Logo > Link`.

### Next Actions

1. Add focused deployment/CORS and DOM nesting regression coverage.
2. Remove nested link composition without changing navigation behavior.
3. Preserve Supabase fetch failures as `DOMAIN_SERVICE_UNAVAILABLE`.
4. Align local project metadata and deploy `domain-orchestrator`.
5. Verify raw preflight, authenticated status, browser UI, and build gates.

## End Audit

Date: 2026-08-11

### Implemented ✓

- Aligned `supabase/config.toml`, `.env`, and the local link on project `shflnrznleodviqphvfg`.
- Deployed `domain-orchestrator` version 4 and `storefront-seo` version 1 with their internal authentication boundaries intact.
- Configured exact production CORS origins and preserved the localhost development allowlist.
- Added source-level preflight/runtime regression coverage and normalized Supabase Edge transport failures.
- Removed nested-link composition from the Domain Connect and Product Detail logo paths.
- Added a Vault-backed `pg_cron`/`pg_net` worker so provider retries do not depend on an open browser.
- The merchant connection page exposes the exact CNAME recipe, registrar-specific guidance, retry action, and provider-capability gate.

### Missing ✗

- The Cloudflare token does not have working Custom Hostnames authorization. The live read-only probe returns HTTP 403 and requires `SSL and Certificates Write` for the StoreBlink SaaS zone.
- The Cloudflare fallback origin cannot be read or confirmed active with the current credential.
- `CUSTOM_HOSTNAME_CNAME_TARGET` does not currently resolve publicly.
- A disposable merchant domain has not completed the pending -> hostname active -> SSL active -> storefront routing lifecycle.

### Partially Implemented △

- StoreBlink's application, Edge Function, database, worker, UI, and retry lifecycle are wired, but external provider activation is intentionally gated until all three Cloudflare readiness checks pass.
- Hostinger read-only domain search and catalog checks pass, while all state-changing registrar flags remain disabled pending separate billing and entitlement acceptance.

### Technical Debt

- Provider readiness remains an operational release gate (`npm run verify:domain-providers`) rather than a CI environment check because CI does not own production provider credentials.
- Production acceptance still needs a disposable domain and a controlled DNS zone; synthetic unit tests cannot prove public DNS propagation or certificate issuance.

### Regression Risk

- Low for browser CORS: live localhost preflight and unauthenticated JSON error responses are verified.
- Low for the React logo composition: component regression coverage rejects nested anchors.
- High for claiming end-to-end domain readiness until Cloudflare permission, fallback origin, managed CNAME DNS, and disposable-domain activation all pass.

### Verification Evidence

- `OPTIONS https://shflnrznleodviqphvfg.supabase.co/functions/v1/domain-orchestrator` from `http://localhost:8082` returns HTTP 204 with the exact allow-origin, `GET, POST, OPTIONS`, and required request headers.
- An unauthenticated POST reaches the deployed function and returns JSON `401 AUTH_REQUIRED` with the matching CORS header instead of an opaque browser network error.
- `npx supabase functions list --project-ref shflnrznleodviqphvfg` reports `domain-orchestrator` version 4 and `storefront-seo` version 1 as `ACTIVE`.
- `npm run verify:supabase` confirms Supabase Auth is reachable on the linked project.
- `npm run verify:domain-providers` passes exact origins, registrar safety, Hostinger search/catalog, and Cloudflare zone ownership; it fails Custom Hostnames permission (403), fallback origin (403), and managed CNAME DNS resolution.
- Domain-focused Vitest passes 8 files and 30 tests; the full suite passes 110 files and 403 tests.
- `npx tsc --noEmit` and `npm run build` pass; `npm run lint` passes with 0 errors and 25 pre-existing warnings.

### Next Actions

1. Rotate the Cloudflare token and grant Zone -> SSL and Certificates -> Edit plus Zone Read for the intended StoreBlink SaaS zone.
2. Configure and activate the Cloudflare for SaaS fallback origin.
3. Create the public managed CNAME target and confirm it resolves.
4. Store the rotated values only in Supabase Edge secrets, redeploy `domain-orchestrator`, and rerun `npm run verify:domain-providers`.
5. Use a disposable owned domain to complete connect, CNAME propagation, hostname activation, SSL activation, storefront routing, and disconnect cleanup before declaring public readiness.

## Production SaaS Acceptance Recheck

Date: 2026-08-12

### Implemented ✓

- `npm run verify:domain-providers` now passes every provider-readiness check.
- Cloudflare reports `origin.storeblink.com` as the active fallback origin.
- `origin.storeblink.com` and `domains.storeblink.com` both resolve publicly over IPv4 and IPv6.
- The Cloudflare runtime values were synced to Supabase Edge secrets without exposing them to the browser.
- `domain-orchestrator` version 6 and `storefront-seo` version 2 are active.
- `wrangler.jsonc` now persists the StoreBlink account and the `*/*` route for zone `storeblink.com`.
- A focused Worker-routing contract test prevents removal of the zone-wide SaaS route.

### Missing ✗

- The persisted wildcard Worker route has not reached Cloudflare production. Both infrastructure hosts currently return HTTP 522.
- A disposable owned merchant hostname has not completed custom-hostname creation, CNAME activation, SSL issuance, storefront resolution, and disconnect cleanup.

### Partially Implemented △

- Provider control-plane readiness is complete, but the data-plane cannot serve custom hosts until the existing `vite-react-shadcn-ts` Worker owns the `*/*` route for `storeblink.com`.

### Technical Debt

- The domain-runtime API token is intentionally least-privileged and cannot deploy Workers. Worker deployment must use Cloudflare OAuth or a separate deploy-only token with Workers Scripts and Workers Routes permissions.

### Regression Risk

- High until `https://origin.storeblink.com` and `https://domains.storeblink.com` stop returning 522.
- Low after the wildcard route is live because the route is persisted in Wrangler configuration and protected by a focused contract test.

### Next Actions

1. In Cloudflare, add route `*/*` on zone `storeblink.com` to Worker `vite-react-shadcn-ts`, or deploy with a separate Workers deployment credential.
2. Confirm the apex, fallback origin, and managed CNAME target return the StoreBlink Worker instead of 522.
3. Connect a disposable owned merchant hostname and verify hostname, SSL, storefront routing, and disconnect cleanup end to end.
