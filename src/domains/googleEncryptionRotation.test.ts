import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptGoogleSecretWithMetadata,
  encryptGoogleSecret,
  googleTokenEncryptionKeyVersion,
} from "../../supabase/functions/_shared/domain/google";

const key = (fill: number) => Buffer.alloc(32, fill).toString("base64url");

describe("Google token encryption key rotation", () => {
  const environment = new Map<string, string>();

  beforeEach(() => {
    environment.clear();
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("Deno", {
      env: { get: (name: string) => environment.get(name) },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decrypts a previous-key envelope and marks it for lazy re-encryption", async () => {
    environment.set("GOOGLE_TOKEN_ENCRYPTION_KEY", key(1));
    environment.set("GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION", "1");
    const oldCiphertext = await encryptGoogleSecret("refresh-token", "google-refresh:store-1");

    environment.set("GOOGLE_TOKEN_ENCRYPTION_KEY", key(2));
    environment.set("GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION", "2");
    environment.set("GOOGLE_TOKEN_ENCRYPTION_PREVIOUS_KEY", key(1));
    environment.set("GOOGLE_TOKEN_ENCRYPTION_PREVIOUS_KEY_VERSION", "1");

    const decrypted = await decryptGoogleSecretWithMetadata(
      oldCiphertext,
      "google-refresh:store-1",
    );
    expect(decrypted).toEqual({
      value: "refresh-token",
      keyVersion: 1,
      requiresReencryption: true,
    });

    const currentCiphertext = await encryptGoogleSecret(
      decrypted.value,
      "google-refresh:store-1",
    );
    expect(currentCiphertext).toMatch(/^v2\./);
    await expect(decryptGoogleSecretWithMetadata(
      currentCiphertext,
      "google-refresh:store-1",
    )).resolves.toMatchObject({
      value: "refresh-token",
      keyVersion: 2,
      requiresReencryption: false,
    });
  });

  it("keeps AES-GCM context binding during rotation", async () => {
    environment.set("GOOGLE_TOKEN_ENCRYPTION_KEY", key(3));
    environment.set("GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION", "2");
    const ciphertext = await encryptGoogleSecret("secret", "google-refresh:store-1");

    await expect(decryptGoogleSecretWithMetadata(
      ciphertext,
      "google-refresh:store-2",
    )).rejects.toMatchObject({ code: "GOOGLE_SECRET_DECRYPTION_FAILED" });
  });

  it("rejects incomplete or colliding rotation configuration", async () => {
    environment.set("GOOGLE_TOKEN_ENCRYPTION_KEY", key(4));
    environment.set("GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION", "2");
    environment.set("GOOGLE_TOKEN_ENCRYPTION_PREVIOUS_KEY", key(5));

    expect(googleTokenEncryptionKeyVersion()).toBe(2);
    await expect(encryptGoogleSecret("secret", "context")).rejects.toMatchObject({
      code: "GOOGLE_ENCRYPTION_KEY_INVALID",
    });

    environment.set("GOOGLE_TOKEN_ENCRYPTION_PREVIOUS_KEY_VERSION", "2");
    await expect(encryptGoogleSecret("secret", "context")).rejects.toMatchObject({
      code: "GOOGLE_ENCRYPTION_KEY_INVALID",
    });
  });
});
