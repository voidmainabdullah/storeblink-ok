# Phase 3 End Architecture Audit

Date: 2026-08-01

Status: Phase 3 is locally implemented and verified, including a real-browser IndexedDB reload test. The production release gate remains partial because the configured target Supabase project is not linked to the available CLI account and its publication-history RPC returned HTTP 404. Durable cross-device rollback therefore cannot be claimed yet.

## Implemented (PASS) ✓

- Engine Scene documents now persist an authoritative `engine_document_version` marker and migrate through an ordered, immutable `MigrationRegistry`.
- The v1-to-v2 migration validates before and after every step, preserves rollback metadata, rejects unknown/future versions, and validates every page scene rather than only the compatibility home scene.
- `NodeSchemaRegistry` supports adjacent node migrations, enforces complete migration chains, stamps node schema versions, and rejects migrations that alter node identity or tree relationships.
- The image node v2 migration converts legacy `props.fit` data to `props.objectFit` without mutating the source document.
- Active editor loads and saves run through the kernel-owned migration service. Legacy scene migration persistence now uses revision-aware `StorefrontPublishingService.saveDraft()` instead of a direct profile-table mutation.
- Dexie-backed recovery persists validated drafts, command journals, recovery metadata, last-valid/server-load/migration/conflict snapshots, bounded retry work, migration reports, and migration backups.
- Command execution, undo, and redo append recovery records through kernel lifecycle hooks. Scene mutation remains command-owned.
- Recovery snapshots are captured synchronously at command time and writes are serialized, preventing a later asynchronous write from journaling the wrong scene.
- `markSaved()` rechecks the live checksum when its queued write commits, so an older save response cannot clear newer unsaved work.
- Offline save retries are coalesced, revision-aware, and use bounded exponential backoff.
- Revision conflicts preserve both local and server documents plus local command metadata; no conflict path silently overwrites either copy.
- Startup recovery offers Restore, Preview differences, and Discard. Conflict recovery offers Keep local and Load server.
- Persisted publication history is merged with same-session recovery points, and the service can restore a durable publication from a new service instance.
- Migration and recovery are private services in each `EditorKernel`; storage failures are reported through payload-redacted telemetry.
- A real Chrome Playwright test writes a validated draft through the production recovery module, reloads the page, creates a new recovery service, and restores the draft from IndexedDB.
- Migration and recovery system contracts are documented in `docs/SYSTEMS/migration-system.md` and `docs/SYSTEMS/recovery-system.md`.

## Verification

| Gate | Result |
|---|---|
| `npm run test -- --maxWorkers=1` | Pass: 80 files, 301 tests |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | Pass: 0 errors; 20 pre-existing Fast Refresh warnings |
| `npm run build` | Pass: Vite 6.4.3, 2,264 modules transformed |
| `npm run verify:public-bundle` | Pass: 24 public chunks; editor recovery/Dexie code is not reachable |
| `npm run verify:security-headers` | Pass: 6 headers and 7 mandatory CSP directives |
| `npm run verify:production-audit` | Pass under the reviewed React Router RSC exception expiring 2026-09-01 |
| `npm run test:e2e -- --grep "validated draft survives"` | Pass in system Chrome |
| v1-to-v2 document fixture | Pass, including page scenes and immutable source assertions |
| failed/future migration handling | Pass: source document retained and migration rejected |
| IndexedDB command/draft race tests | Pass |
| offline retry and revision-conflict preservation | Pass in repository integration tests |
| durable publication restore in a new service instance | Pass against the in-memory publishing gateway |
| target Supabase publication-history RPC | Fail: HTTP 404; target project is not linked/visible to the available CLI account |

## Missing (FAIL) ✗

- The checked-in publication-history migration and RLS contract have not been deployed and exercised against the configured target Supabase project.
- Durable rollback after a new device/session cannot pass its production acceptance gate until the remote publication-history RPC is available.
- A two-authenticated-session browser test against the target backend has not verified a real remote revision conflict and resolution.

## Partially Implemented (PARTIAL) △

- Publication rollback is durable in the repository gateway contract and service tests, but only same-browser recovery is currently evidenced against a real persistence engine.
- The legacy serialized-theme fallback remains backward compatible but cannot provide the same compare-and-swap guarantees as the RPC path.
- Storage failure telemetry is wired, but durable telemetry transport belongs to Phase 9.
- Playwright certifies reload/reconstruction in Chrome; the full browser/device matrix belongs to Phase 9.

## Technical Debt

- The target Supabase project must be linked by an authorized operator before migrations and RLS can be validated.
- Compatibility publishing fallback code must remain until all deployed stores use the revision-aware RPC contract.
- Theme-package migrations and Engine-document migrations remain separate by design; a future orchestration layer may present one combined report.
- Twenty Fast Refresh export-boundary warnings remain outside the Phase 3 runtime path.
- The reviewed React Router RSC advisory exception expires on 2026-09-01.

## Regression Risk

- High: deploying application code without the matching Supabase publication migration leaves cross-device rollback unavailable.
- High: removing the compatibility fallback before target-store migration would strand older profiles.
- Medium: IndexedDB quota/private-mode failures can disable durable local recovery; the editor continues in memory and surfaces telemetry, but cannot guarantee crash restoration in that environment.
- Medium: changing command hook ordering could journal stale scene data; race regression tests must remain mandatory.
- Low: the public bundle is protected by the dependency traversal gate and currently contains no recovery/editor code.

## Next Actions

1. Link the configured target Supabase project with an authorized account, deploy the checked-in migrations, and verify publication-history RPCs plus RLS with two authenticated sessions.
2. Re-run the remote conflict and cross-device rollback acceptance tests; only then promote Phase 3 from partial to fully closed.
3. Begin Phase 4 locally without weakening the unresolved production gate: audit the existing layout/responsive systems against generic layout modes, sizing modes, intrinsic measurement, semantic responsive intent, diagnostics, and storefront scale calibration.
4. Keep the Phase 3 remote deployment gate visible in every later production-readiness report.
