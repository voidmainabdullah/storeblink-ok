# ADR-0004: StoreKit Lockfile Version

## Status

Accepted - 2026-08-21

## Context

Exposing independent versions for DesignPack, templates, components, tokens,
engine schema, and migration ranges would create an untestable compatibility
matrix for merchants and support staff.

## Decision

The StoreKit version is the only merchant-facing version. Each immutable
StoreKit release pins exact IDs, versions, schema versions, and integrity hashes
for its DesignPack, ComponentLibrary, TemplateBlueprint assignments, token
schema, engine schema, migrations, and capability policy. Published artifacts
record the complete resolved lockfile.

An installation is an atomic transaction: preflight every pin and required page
assignment, capture a rollback snapshot, compile all templates, validate the
artifact, persist the installation and artifact, then commit the active pointer.
Any failure rolls back the complete operation.

Individual packages may evolve independently during development, but a package
version is not installable until a StoreKit release pins and certifies it.

## Consequences

- Support, rollback, and migrations reason about one StoreKit version.
- StoreKit releases are immutable; fixes produce a new version.
- Installation records retain both the single pin and the resolved lockfile for
  forensic reproducibility.
- Missing Product, Collection, Page, Blog, Cart, Search, or 404 assignments make
  a StoreKit non-installable.

