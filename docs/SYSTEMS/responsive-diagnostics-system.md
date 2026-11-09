# Responsive Diagnostics System

## Purpose
Analyzes resolved layouts for responsive usability risks and returns advisory, command-ready fixes without blocking merchant editing or publishing.

## Owns
- Responsive diagnostic detection and stable issue identities.
- Suggested fix plans for safe automatic corrections.
- Resolved diagnostic reports per breakpoint and viewport width.

## Does NOT Own
- Persisted ignore preferences.
- Scene Graph mutation.
- Security/runtime validation blockers.
- Inspector selection state.

## Public API
```ts
interface ResponsiveDiagnosticsSystemAPI {
  analyze(scene: SceneTree, options: DiagnosticOptions): ResponsiveDiagnosticReport;
  applyFix(scene: SceneTree, issue: ResponsiveDiagnostic): SceneTree;
}
```

## Depends On
- Layout Engine.
- Responsive System.
- Intrinsic Measurement System.
- Responsive Rule Registry.
- Scene Graph validation.

## Folder
`src/layout/diagnostics/`

## State Ownership
None. Reports and fixed scenes are immutable return values. The inspector owns temporary ignored/review UI state; the Command System owns any accepted document change.

## Event Flow
Scene/breakpoint change -> diagnostics analysis -> inspector advisory -> Fix automatically -> cloned fixed scene -> one Scene Replace Command -> History/Recovery/Renderer.

## Performance Notes
Diagnostics run after committed scene changes, not during transform previews. Analysis reuses the bounded intrinsic measurement cache and one read-only layout pass.

## Known Pitfalls / Anti-Patterns
- Do not make responsive advisories publish blockers.
- Do not apply a fix automatically without an explicit merchant action.
- Do not retain a fix after its target node has changed or disappeared.
- Do not classify decorative overflow as content failure unless the node opts in.

## Extensibility
Additional diagnostic codes can produce review-only advisories or typed fix plans. Security and runtime failures remain in their authoritative validation systems.
