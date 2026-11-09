# ADR-0001: Semantic Base and Merchant Patches

## Status

Accepted - 2026-08-21

## Context

The current Scene Graph mixes theme defaults, merchant edits, commerce data,
and resolved layout. Reconciliation and theme updates therefore cannot tell
which values belong to the merchant and which belong to the package.

## Decision

Persist an immutable StoreKit base plus ordered merchant patches addressed by
stable semantic paths. A patch contains an ID, the StoreKit base version it was
authored against, a target path, and typed `set`, `unset`, `insert`, `remove`,
or `reorder` operations. Commerce bindings are stored separately and are never
represented as presentation patches.

Patch application is deterministic. Invalid or missing paths fail validation;
they never silently fall back to opaque node IDs. StoreKit updates first detect
base-versus-merchant conflicts. The initial safe behavior is explicit conflict
review. Automatic three-way merge may resolve only structurally non-overlapping
changes and must return unresolved conflicts as data.

The Scene Graph remains an edit/render intermediate representation. It is not
the persisted authoring source for v3 installations.

## Consequences

- Merchant intent survives catalog refreshes and compatible StoreKit updates.
- Semantic-path renames require declared migration aliases.
- Reorder operations need stable collection item keys.
- Imported legacy stores require a semantic extraction and shadow-diff gate
  before v3 activation.

