import { describe, expect, it } from "vitest";
import {
  APP_BLOCK_FRAME_SCOPE,
  APP_BLOCK_PROTOCOL_VERSION,
} from "./contracts";
import { AppBlockSession } from "./AppBlockSession";
import { createExtensionGrant, createExtensionManifest } from "./testFixtures";

const TOKEN = "a".repeat(64);

const message = (overrides: Record<string, unknown> = {}) => ({
  scope: APP_BLOCK_FRAME_SCOPE,
  protocolVersion: APP_BLOCK_PROTOCOL_VERSION,
  token: TOKEN,
  type: "frame:action",
  action: "add-to-cart",
  productId: "product-one",
  quantity: 1,
  path: null,
  ...overrides,
});

describe("AppBlockSession", () => {
  it("rejects forged source windows, versions, tokens, and unknown payload fields", () => {
    const session = new AppBlockSession({
      token: TOKEN,
      block: createExtensionManifest().appBlocks[0],
      grant: createExtensionGrant(),
    });
    expect(session.handleMessage(message(), false)).toMatchObject({ accepted: false, reason: "source-window" });
    expect(session.handleMessage(message({ token: "b".repeat(64) }), true))
      .toMatchObject({ accepted: false, reason: "session-token" });
    expect(session.handleMessage(message({ protocolVersion: 999 }), true))
      .toMatchObject({ accepted: false, reason: "message-schema" });
    expect(session.handleMessage(message({ unexpected: "payload" }), true))
      .toMatchObject({ accepted: false, reason: "message-schema" });
    expect(session.handleMessage(message({ action: "open-cart" }), true))
      .toMatchObject({ accepted: false, reason: "message-schema" });
    expect(session.handleMessage(message({
      action: "navigate",
      productId: null,
      quantity: null,
      path: "/\\evil.test",
    }), true)).toMatchObject({ accepted: false, reason: "message-schema" });
  });

  it("mediates actions only with the required grant capability", () => {
    const grant = createExtensionGrant();
    grant.grantedCapabilities = grant.grantedCapabilities.filter((entry) => entry !== "commerce/cart.add");
    const session = new AppBlockSession({
      token: TOKEN,
      block: createExtensionManifest().appBlocks[0],
      grant,
    });
    expect(session.handleMessage(message(), true))
      .toMatchObject({ accepted: false, reason: "capability" });
  });

  it("rate-limits mediated actions and stops immediately on revocation", () => {
    const grant = createExtensionGrant();
    grant.quotas.maxActionsPerMinute = 1;
    const session = new AppBlockSession({
      token: TOKEN,
      block: createExtensionManifest().appBlocks[0],
      grant,
      now: () => 1_000,
    });
    expect(session.handleMessage(message(), true).accepted).toBe(true);
    expect(session.handleMessage(message(), true))
      .toMatchObject({ accepted: false, reason: "action-rate" });
    session.revoke();
    expect(session.handleMessage(message({ type: "frame:ready" }), true))
      .toMatchObject({ accepted: false, reason: "revoked" });
  });

  it("fails closed when an active grant expires during a session", () => {
    let now = Date.parse("2026-08-21T12:30:00.000Z");
    const grant = createExtensionGrant();
    grant.expiresAt = "2026-08-21T13:00:00.000Z";
    const session = new AppBlockSession({
      token: TOKEN,
      block: createExtensionManifest().appBlocks[0],
      grant,
      now: () => now,
    });
    expect(session.handleMessage(message(), true).accepted).toBe(true);
    now = Date.parse("2026-08-21T13:00:00.000Z");
    expect(session.handleMessage(message(), true))
      .toMatchObject({ accepted: false, reason: "expired" });
  });
});
