# Adaptive Storefront Authoring

## Purpose

Provides the merchant-facing Store and Design editing surface for a server-confirmed Adaptive Commerce source. It records declarative merchant intent through commands and saves that intent atomically without compiling, activating, or publishing a storefront.

## Owns

- The local authoring command session and its undo/redo cursor.
- Draft projections of semantic values, certified section order/visibility/variant controls, DesignPack choices, and existing commerce-binding selectors.
- The authenticated load/save gateway for canonical authoring source.
- The `MyStore` decision boundary between a confirmed adaptive source and a confirmed legacy source.

## Does NOT Own

- StoreKit installation, compilation, shadow acceptance, activation, rollout, or publication.
- Runtime artifact rendering or pixel-accurate storefront preview.
- Raw Scene Graph nodes, CSS, arbitrary tokens, breakpoints, responsive policies, or unsupported component properties.
- Legacy `EngineEditor` state.

## Public API

```ts
interface AdaptiveAuthoringGateway {
  load(storeId: string): Promise<AdaptiveAuthoringSource | null>;
  save(request: AdaptiveAuthoringSaveRequest): Promise<AdaptiveAuthoringSaveResult>;
}

createAdaptiveAuthoringSession(source): AdaptiveAuthoringSession;
executeAdaptiveAuthoringCommand(session, command): AdaptiveAuthoringSession;
undoAdaptiveAuthoringCommand(session): AdaptiveAuthoringSession;
redoAdaptiveAuthoringCommand(session): AdaptiveAuthoringSession;
projectAdaptiveAuthoringSession(session): AdaptiveAuthoringProjection;
```

The browser RPC boundary is:

- `load_adaptive_storefront_authoring_source(store_id)` — authenticated `theme.read`.
- `save_adaptive_storefront_authoring_patch(...)` — authenticated `theme.edit`, expected source revision, and idempotency key.

## Depends On

- Adaptive Commerce contracts and released 8-route authoring catalog.
- Merchant Patch System.
- Compiler-owned section-control paths.
- Design token resolver.
- Supabase authentication, store capabilities, and authoring RPCs.

## Folder

`src/adaptive-commerce/authoring/`

Merchant UI: `src/pages/dashboard/AdaptiveStoreEditor*.tsx`

Database boundary: `supabase/migrations/20260821000400_adaptive_storefront_authoring.sql`

## State Ownership

`AdaptiveStoreEditor` exclusively owns the ephemeral command list and undo/redo list. React controls dispatch commands; they do not mutate the canonical StoreDefinition directly. The database RPC exclusively owns committed source revision, source hash, patch append, and installation source update inside one transaction.

## Event Flow

1. `MyStore` asks the authenticated gateway for the current store's authoring source.
2. A real staged/active source opens `AdaptiveStoreEditor`; a confirmed `null` opens legacy `EngineEditor`; a failed/unknown assignment opens neither editor.
3. Store/Design controls create semantic, reorder, preset, token, or binding commands. Before history changes, the command boundary rejects any visibility command whose projected route would have no visible certified section.
4. Projection applies accepted commands over the canonical base plus existing MerchantPatches and compacts no-op intent.
5. Save sends one declarative, revision-checked, idempotent request.
6. The RPC validates released catalog ownership and atomically appends the patch/update; the editor reloads authoritative source.
7. The result remains `review-needed`. No compiler job or publication is triggered.
8. The separate Release Review panel validates only this saved source, then requires explicit review and publication permissions before the live pointer can change.

## Performance Notes

- History stores commands rather than document snapshots.
- Projection compacts repeated scalar edits and derives only net collection reorder operations.
- Route panels render only controls declared by the active blueprint and ComponentLibrary policy.
- Save reuses the same idempotency request after an uncertain network result until commands change.

## Known Pitfalls / Anti-Patterns

- Never infer an adaptive assignment from client cache or theme name. Only a valid server source may select the adaptive editor.
- Never fall through to either editor while assignment loading fails; the runtime owner is unknown.
- Never expose a scalar merely because it exists in the semantic document. The exact section property must be compiler-recognized and merchant-editable.
- Never hide the final visible section of a route. The UI disables that action, `executeAdaptiveAuthoringCommand` rejects forged or programmatic attempts before they enter history, save blocks any already-invalid source, and the compiler remains the final fail-closed authority.
- Never describe the local preview as the compiled storefront. It is explicitly a structural draft preview and is not pixel-accurate.
- Never turn Save into compile, install, activate, or publish.

## Extensibility

New authoring controls require all of the following: a versioned contract, compiler support, a released ComponentLibrary or DesignPack policy, server validation, a command type if existing commands are insufficient, and focused UI/database tests. Unsupported future policies remain visible as explanatory read-only metadata until that complete path exists.
