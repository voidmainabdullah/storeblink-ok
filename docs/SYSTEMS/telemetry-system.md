# Telemetry System

## Purpose

Captures bounded, structured, privacy-filtered runtime events for diagnostics and future observability adapters.

## Owns

- In-memory event retention and maximum size.
- Event IDs, timestamps, correlation IDs, levels, and sanitized context.
- Event subscribers.

## Does NOT Own

- Remote telemetry transport.
- User-facing error presentation.
- Raw credentials, tokens, or personal data.

## Public API

```ts
interface TelemetrySystemAPI {
  track(
    name: string,
    level?: TelemetryLevel,
    context?: Record<string, unknown>,
    correlationId?: string,
  ): TelemetryEvent;
  list(): readonly TelemetryEvent[];
  subscribe(listener: (event: TelemetryEvent) => void): () => void;
  clear(): void;
}
```

## Depends On

- Browser or Node cryptographic UUID support when available.

## Folder

`src/infrastructure/telemetry/`

## State Ownership

One kernel-scoped instance owns its bounded event list and subscribers.

## Event Flow

The kernel command manager emits correlated success and failure events without
including command payloads. Each event is retained and synchronously delivered
to subscribers; future transport adapters may subscribe without changing
producers.

## Performance Notes

Retention is bounded, arrays are capped during sanitization, and recursive context traversal has a depth limit.

## Known Pitfalls / Anti-Patterns

- Do not submit secrets and depend solely on redaction.
- Do not place telemetry in pointer-move hot paths without sampling.
- Do not use telemetry as the source of truth for business state.

## Extensibility

Remote adapters can subscribe and batch events by level and correlation ID.
