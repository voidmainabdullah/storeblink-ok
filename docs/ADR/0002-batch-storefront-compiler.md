# ADR-0002: Batch Storefront Compiler

## Status

Accepted - 2026-08-21

## Context

Running template resolution or layout compilation during a shopper request
would make availability, latency, and output depend on mutable application
state. Preview and publication could also disagree.

## Decision

The Storefront Compiler is a deterministic batch pipeline. It runs for editor
preview and again under server authority at publish time, but never per public
request. Its inputs are a validated semantic store document and one exact
StoreKit lockfile. It performs schema migration, token resolution, blueprint
resolution, slot/component resolution, merchant patch application, commerce
binding declaration, responsive compilation, accessibility validation, asset
manifest construction, and performance-policy checks.

The output is an immutable Runtime Artifact with a deterministic hash. Public
runtime code reads only the active artifact. A publish transaction writes the
artifact and swaps the active pointer atomically. Personalization may select
between precompiled artifacts at the edge; it may not invoke the compiler.

The browser preview and server compiler share fixtures and compatibility tests.
Only the server result is publish-authoritative.

## Consequences

- Compiler stages must be pure and must not fetch network data.
- Commerce snapshots and asset metadata required for compilation are explicit
  inputs.
- Compilation failures leave the previous active publication untouched.
- Legacy Scene Graph documents remain behind a migration/canary adapter, not a
  permanent alternate v3 source of truth.

