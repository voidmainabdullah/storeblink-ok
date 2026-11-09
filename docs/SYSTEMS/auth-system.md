# Authentication and Authorization System

## Purpose

Authenticate merchant-dashboard users once, resolve their selected store and
effective capabilities, and keep public storefront routes independent from
merchant session state.

## Owns

- Browser session lifecycle and normalized auth state.
- Sign-up, sign-in, sign-out, password recovery, and password updates.
- TOTP enrollment, challenge, verification, and AAL2 state.
- Lightweight dashboard bootstrap caching.
- Selected-store membership and capability UX state.
- Typed translation of Supabase auth and authorization errors.

## Does NOT Own

- Public storefront identity or published catalog reads.
- Database authorization decisions; RLS and secure RPCs are authoritative.
- Products, orders, assets, Scene Graph documents, or other feature data.
- Store role persistence or JWT membership lists.
- Auth-provider settings such as leaked-password protection.

## Public API

```ts
interface AuthContextAPI {
  user: User | null;
  session: Session | null;
  bootstrap: DashboardBootstrap | null;
  currentStore: AuthStoreSummary | null;
  membership: AuthMembership | null;
  capabilities: readonly StoreCapability[];
  assuranceLevel: "aal1" | "aal2" | null;
  signUp(input: SignUpInput): Promise<SignUpResult>;
  signIn(input: SignInInput): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string, redirectTo: string, captchaToken?: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  hasCapability(capability: StoreCapability): boolean;
  requireCapability(capability: StoreCapability): void;
  refreshAuthorization(): Promise<DashboardBootstrap | null>;
  switchStore(storeId: string): Promise<DashboardBootstrap>;
  refreshAssuranceLevel(): Promise<"aal1" | "aal2" | null>;
  listMfaFactors(): Promise<readonly MfaFactorSummary[]>;
  enrollTotp(friendlyName?: string): Promise<MfaEnrollment>;
  verifyMfa(factorId: string, code: string): Promise<void>;
  unenrollMfa(factorId: string): Promise<void>;
}
```

## Depends On

- The single lazy browser client in `src/platform/supabase/client.ts`.
- Supabase Auth native persistence, refresh, and PKCE lifecycle.
- `get_dashboard_bootstrap` and capability-aware Postgres RLS/RPCs.
- Cloudflare Turnstile when `VITE_TURNSTILE_SITE_KEY` is configured.

## Folder

`src/platform/auth/`

## State Ownership

`AuthProvider` exclusively owns the React session, user, bootstrap, selected
store, capabilities, assurance level, and auth error state. `SessionManager`
owns its framework-independent session snapshot. Feature components consume
`useAuth()` and never initialize Supabase Auth themselves.

## Event Flow

Dashboard route -> lazy `AuthBoundary` -> `SessionManager.initialize()` ->
native Supabase session -> `get_dashboard_bootstrap` -> capability-aware
`AuthGuard` -> feature service -> explicit store-scoped query/RPC -> RLS.

Auth changes, token refresh, browser focus, visibility changes, and the
60-second authorization timer refresh the small bootstrap. A revoked
membership becomes a typed `STORE_MEMBERSHIP_REVOKED` denial. `/store/*`
instead uses anonymous `publicRest` and never enters this flow.

## Performance Notes

- The browser client is lazy and singleton; importing public configuration has
  no auth side effect.
- Bootstrap contains only profile summary, selected store, membership, and
  capabilities and is cached for 30 seconds.
- Request versioning prevents stale store-switch/bootstrap responses from
  overwriting current state.
- Session lifecycle versioning prevents disposed Strict Mode initializations
  from publishing into a remounted provider, and duplicate Supabase/manual
  `INITIAL_SESSION` results are coalesced before authorization bootstrap.
- Auth boundaries and Supabase code are lazy route chunks; the production
  public-bundle verifier walks the static manifest graph.

## Known Pitfalls / Anti-Patterns

- Frontend capability checks improve UX but never replace RLS.
- Do not query profiles or sessions from feature components.
- Do not put per-store memberships into JWT claims.
- Do not import the authenticated client from public storefront modules.
- Sensitive routes and mutations must both require AAL2; UI-only step-up is
  insufficient.
- Never expose a service-role or secret key in browser configuration.

## Extensibility

New dashboard features add a typed capability, map it in
`private.role_capabilities`, enforce it in RLS or a secure RPC, and optionally
declare it on `AuthGuard`. New sensitive operations reuse AAL2 and should add a
database policy/test before UI wiring.
