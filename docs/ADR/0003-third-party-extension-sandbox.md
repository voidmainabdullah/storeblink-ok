# ADR-0003: Third-Party Extension Sandbox

## Status

Accepted - 2026-08-21

## Context

Package signatures establish publisher identity but do not isolate browser or
network behavior. Allowing arbitrary third-party React in the storefront would
give a theme the same authority as first-party application code.

## Decision

Third-party packages are declarative by default: tokens, blueprints, variants,
assets, schemas, and bounded expressions. Executable app blocks render in a
sandboxed iframe using a strict CSP and a versioned `postMessage` bridge. The
host validates source window, message scope, session token, payload schema,
rate/size limits, and the block's granted capabilities before performing an
action.

Capability namespaces are `platform/*`, `commerce/*`, `theme/*`, `app/*`, and
`merchant/*`. Third-party blocks receive a minimal read-only data projection;
they receive no raw DOM access, cookies, credentials, unrestricted storage, or
arbitrary network access. A reviewed partner may use a CSP-locked Shadow DOM
only under an explicit higher trust level. StoreKit manifests cannot request a
capability their trust level does not permit.

## Consequences

- The existing custom-code iframe is a compatibility foundation, not the
  third-party permission model itself.
- Every extension action is auditable and rejectable by the host.
- App blocks need graceful unavailable/error states.
- Marketplace review and signing remain separate from runtime isolation.

