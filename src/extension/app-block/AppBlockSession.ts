import {
  APP_BLOCK_HOST_SCOPE,
  APP_BLOCK_PROTOCOL_VERSION,
  appBlockFrameMessageSchema,
  appBlockHostMessageSchema,
  type AppBlockDataProjection,
  type AppBlockDefinition,
  type AppBlockFrameMessage,
  type AppBlockHostMessage,
  type ExtensionGrant,
} from "./contracts";
import { capabilityForAppBlockAction } from "./ExtensionSecurityPolicy";

export type AppBlockSessionResult =
  | Readonly<{ accepted: false; reason: string }>
  | Readonly<{
      accepted: true;
      type: AppBlockFrameMessage["type"];
      message: AppBlockFrameMessage;
    }>;

export type AppBlockSessionOptions = Readonly<{
  token: string;
  block: AppBlockDefinition;
  grant: ExtensionGrant;
  now?: () => number;
}>;

const serializedBytes = (value: unknown): number => {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
  return typeof TextEncoder === "undefined"
    ? serialized.length
    : new TextEncoder().encode(serialized).byteLength;
};

export const createAppBlockSessionToken = (
  cryptoApi: Pick<Crypto, "getRandomValues"> | undefined = globalThis.crypto,
): string => {
  if (!cryptoApi?.getRandomValues) {
    throw new Error("Secure randomness is required for an app-block session.");
  }
  const bytes = new Uint8Array(32);
  cryptoApi.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
};

export class AppBlockSession {
  private readonly actionTimes: number[] = [];
  private revoked = false;

  constructor(private readonly options: AppBlockSessionOptions) {
    if (!/^[a-f0-9]{64}$/.test(options.token)) {
      throw new Error("App-block session token must contain 256 bits of lowercase hex.");
    }
  }

  revoke(): void {
    this.revoked = true;
  }

  createInit(data: AppBlockDataProjection): AppBlockHostMessage {
    this.assertActive();
    const message = appBlockHostMessageSchema.parse({
      scope: APP_BLOCK_HOST_SCOPE,
      protocolVersion: APP_BLOCK_PROTOCOL_VERSION,
      token: this.options.token,
      type: "host:init",
      block: this.options.block,
      data,
    }) as AppBlockHostMessage;
    if (serializedBytes(message) > this.options.grant.quotas.maxMessageBytes) {
      throw new Error("App-block initialization exceeds the message quota.");
    }
    return structuredClone(message);
  }

  handleMessage(rawMessage: unknown, sourceMatches: boolean): AppBlockSessionResult {
    if (!sourceMatches) return { accepted: false, reason: "source-window" };
    if (this.revoked || this.options.grant.status !== "active") {
      return { accepted: false, reason: "revoked" };
    }
    if (
      this.options.grant.expiresAt &&
      new Date(this.options.grant.expiresAt).getTime() <= (this.options.now ?? Date.now)()
    ) return { accepted: false, reason: "expired" };
    if (serializedBytes(rawMessage) > this.options.grant.quotas.maxMessageBytes) {
      return { accepted: false, reason: "message-quota" };
    }
    const parsed = appBlockFrameMessageSchema.safeParse(rawMessage);
    if (!parsed.success) return { accepted: false, reason: "message-schema" };
    const message = parsed.data as AppBlockFrameMessage;
    if (message.token !== this.options.token) return { accepted: false, reason: "session-token" };

    const granted = new Set(this.options.grant.grantedCapabilities);
    if (message.type === "frame:resize" && !granted.has("app/frame.resize")) {
      return { accepted: false, reason: "capability" };
    }
    if (message.type === "frame:action") {
      const capability = capabilityForAppBlockAction(message.action);
      if (!granted.has(capability)) return { accepted: false, reason: "capability" };
      if (
        (message.action === "add-to-cart" || message.action === "view-product") &&
        !message.productId
      ) return { accepted: false, reason: "action-payload" };
      if (message.action === "navigate" && !message.path) {
        return { accepted: false, reason: "action-payload" };
      }
      const now = (this.options.now ?? Date.now)();
      while (this.actionTimes.length && this.actionTimes[0] <= now - 60_000) {
        this.actionTimes.shift();
      }
      if (this.actionTimes.length >= this.options.grant.quotas.maxActionsPerMinute) {
        return { accepted: false, reason: "action-rate" };
      }
      this.actionTimes.push(now);
    }
    return { accepted: true, type: message.type, message: structuredClone(message) };
  }

  private assertActive(): void {
    if (this.revoked || this.options.grant.status !== "active") {
      throw new Error("App-block grant is revoked.");
    }
    if (
      this.options.grant.expiresAt &&
      new Date(this.options.grant.expiresAt).getTime() <= (this.options.now ?? Date.now)()
    ) throw new Error("App-block grant is expired.");
  }
}
