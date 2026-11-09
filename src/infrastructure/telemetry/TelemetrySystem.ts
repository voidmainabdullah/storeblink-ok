export type TelemetryLevel = "debug" | "info" | "warning" | "error";

export type TelemetryEvent = Readonly<{
  id: string;
  name: string;
  level: TelemetryLevel;
  timestamp: string;
  correlationId: string;
  payload: Readonly<Record<string, unknown>>;
}>;

export type TelemetrySystemOptions = {
  maximumEvents?: number;
  redactedKeys?: readonly string[];
};

const identifier = (prefix: string): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const DEFAULT_REDACTED_KEYS = [
  "password",
  "token",
  "authorization",
  "cookie",
  "secret",
  "paymentMethod",
  "cardNumber",
  "email",
] as const;

const sanitize = (value: unknown, redacted: Set<string>, depth = 0): unknown => {
  if (depth > 6) return "[depth-limited]";
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => sanitize(entry, redacted, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 100)
      .map(([key, entry]) => [
        key,
        redacted.has(key.toLowerCase()) ? "[redacted]" : sanitize(entry, redacted, depth + 1),
      ]),
  );
};

export class TelemetrySystem {
  private readonly maximumEvents: number;
  private readonly redactedKeys: Set<string>;
  private readonly listeners = new Set<(event: TelemetryEvent) => void>();
  private events: TelemetryEvent[] = [];

  constructor(options: TelemetrySystemOptions = {}) {
    this.maximumEvents = Math.max(10, Math.floor(options.maximumEvents ?? 500));
    this.redactedKeys = new Set((options.redactedKeys ?? DEFAULT_REDACTED_KEYS).map((key) => key.toLowerCase()));
  }

  track(
    name: string,
    payload: Record<string, unknown> = {},
    options: { level?: TelemetryLevel; correlationId?: string } = {},
  ): TelemetryEvent {
    if (!name.trim()) throw new Error("Telemetry events require a name.");
    const event: TelemetryEvent = Object.freeze({
      id: identifier("event"),
      name: name.trim(),
      level: options.level ?? "info",
      timestamp: new Date().toISOString(),
      correlationId: options.correlationId ?? identifier("correlation"),
      payload: Object.freeze(sanitize(payload, this.redactedKeys) as Record<string, unknown>),
    });
    this.events = [...this.events, event].slice(-this.maximumEvents);
    this.listeners.forEach((listener) => listener(event));
    return event;
  }

  list(): readonly TelemetryEvent[] {
    return [...this.events];
  }

  subscribe(listener: (event: TelemetryEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.events = [];
  }
}

export const createTelemetrySystem = (options?: TelemetrySystemOptions) => new TelemetrySystem(options);
