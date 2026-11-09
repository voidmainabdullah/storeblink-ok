# Adaptive Theme Studio

## Purpose

Provide a separately authorized, developer-facing surface for inspecting the Adaptive Commerce certification registry, compiler, package identities, route coverage, design tokens, responsive primitives, diagnostics, and the current store's public runtime assignment. It may request a compiler-validated, review-only storefront proposal, but it cannot install or publish that proposal.

## Owns

- The `/dashboard/theme-studio` diagnostic presentation.
- A deterministic report built from the registered built-in StoreKit catalog and real `StorefrontCompiler` pipeline.
- A read-only public runtime-assignment lookup for the active store handle.
- Clear product boundaries between merchant Store mode, Design mode, and developer Theme Studio.
- Transient, review-only AI proposals containing released StoreKit, preset, and certified variant identifiers.
- Transient page loading, error, and refresh state.

## Does NOT Own

- The active `/dashboard/store` editor, Scene Graph, selection, transforms, or editor modes.
- StoreKit installation, merchant patch persistence, draft saving, publication, or rollout mutation.
- Package authoring, direct token editing, arbitrary CSS, or runtime artifact editing.
- Claims that the certification fixture is installed on the current merchant store.
- Authentication, capability evaluation, or MFA state; the platform auth system owns them.

## Public API

```ts
loadThemeStudioDiagnostics({
  storeHandle,
  dependencies?,
}): Promise<ThemeStudioDiagnosticsReport>;

const THEME_STUDIO_ROUTE_POLICY = {
  capabilities: ["theme.studio"],
  requireStore: true,
  requireAal2: true,
};

planAdaptiveStorefront({ storeId, intent }): Promise<AdaptivePlannerProposal>;
```

## Depends On

- `AdaptiveCommerceRegistry` and the built-in certified catalog fixture.
- `StorefrontCompiler` and its deterministic stage/diagnostic contracts.
- Adaptive token and responsive primitive public APIs.
- `RuntimeArtifactResolver` for the current public assignment lookup.
- Platform `AuthGuard` for store scope, `theme.studio`, and AAL2 enforcement.
- The authenticated adaptive planner endpoint for allow-listed, compiler-validated proposals.

## Folder

- Diagnostic system: `src/adaptive-commerce/studio/`
- Route and UI: `src/pages/dashboard/ThemeStudio*.tsx`

## State Ownership

The diagnostic system owns no mutable store and never writes through an editor gateway. The React page owns only its in-flight request, report, proposal, and error presentation. The planner endpoint may append a privacy-safe audit record, but it cannot write a merchant document, installation, publication, or runtime pointer. The editor Command System remains the exclusive mutation path for document data.

Any future Theme Studio mutation must be introduced as a named, validated command with explicit execute/undo behavior and an auditable persistence boundary. UI components must not write the Scene Graph, theme document, package registry, installation record, or runtime pointer directly.

## Event Flow

1. `OnboardingGate` admits an onboarded account to the dashboard layout.
2. `ThemeStudioAccessBoundary` requires an active store, `theme.studio`, and AAL2 before mounting the page.
3. The report loader creates an isolated registered certification catalog and runs installability validation.
4. A deterministic compiler invocation verifies all required routes and returns actual stages and diagnostics.
5. The public runtime resolver checks whether the active store currently serves legacy or adaptive output.
6. The page presents certification and current-runtime results separately so neither can be mistaken for the other.
7. On explicit request, the planner returns only released identifiers after compiler preflight; the page labels the result as a proposal and confirms no storefront change occurred.

## Performance Notes

The diagnostic compile is deterministic and runs only when the protected page mounts or the user explicitly reruns checks. It uses an isolated registry, does not subscribe to editor stores, and does not trigger background polling. The public runtime lookup is one bounded request and degrades to an explicit unavailable state.

## Known Pitfalls / Anti-Patterns

- Never label the built-in certification result as the current store's installed or published state.
- Never show a success state after registry/compiler failure or an unavailable runtime response.
- Do not embed Theme Studio controls into Store mode or expose raw CSS controls there.
- Do not bypass `theme.studio`, store scope, or AAL2 because a panel is read-only today.
- Do not mutate packages or the editor document from local React state.
- Never turn a planner response into an implicit Apply action; installation remains a separate atomic and reversible workflow.
- Do not absorb Store/Design responsibilities into this developer surface.

## Extensibility

Additional read-only registries, evaluation reports, and publication provenance can extend `ThemeStudioDiagnosticsReport`. Mutating capabilities require their own command, authorization, validation, confirmation, audit, and persistence contracts before UI controls are added.
