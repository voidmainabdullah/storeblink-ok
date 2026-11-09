import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./AuthService";

describe("AuthService", () => {
  it("passes identity metadata, PKCE redirect and Turnstile token during sign-up", async () => {
    const signUp = vi.fn(async () => ({
      data: { user: { id: "user-1" }, session: null },
      error: null,
    }));
    const service = new AuthService({ auth: { signUp } } as any);

    const result = await service.signUp({
      email: "merchant@example.test",
      password: "StrongPassword1",
      fullName: "Merchant",
      businessName: "Merchant Store",
      emailRedirectTo: "https://storeblink.test/auth/callback",
      captchaToken: "turnstile-token",
    });

    expect(signUp).toHaveBeenCalledWith({
      email: "merchant@example.test",
      password: "StrongPassword1",
      options: {
        emailRedirectTo: "https://storeblink.test/auth/callback",
        data: { full_name: "Merchant", business_name: "Merchant Store" },
        captchaToken: "turnstile-token",
      },
    });
    expect(result.requiresEmailVerification).toBe(true);
  });

  it("normalizes rate limiting without exposing the backend message", async () => {
    const service = new AuthService({
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { user: null, session: null },
          error: { status: 429, message: "provider request throttled: internal-id" },
        })),
      },
    } as any);

    await expect(service.signIn({ email: "merchant@example.test", password: "invalid" }))
      .rejects.toMatchObject({
        code: "AUTH_RATE_LIMITED",
        message: "Too many attempts. Wait a moment and try again.",
        status: 429,
      });
  });

  it("normalizes a signup transport failure", async () => {
    const service = new AuthService({
      auth: {
        signUp: vi.fn(async () => {
          throw new TypeError("Failed to fetch");
        }),
      },
    } as any);

    await expect(service.signUp({
      email: "merchant@example.test",
      password: "StrongPassword1",
      fullName: "Merchant",
      businessName: "Merchant Store",
      emailRedirectTo: "https://storeblink.test/auth/callback",
    })).rejects.toMatchObject({
      code: "AUTH_BACKEND_UNAVAILABLE",
      message:
        "Authentication service is temporarily unavailable. Try again shortly or contact support.",
    });
  });

  it("challenges and verifies a TOTP factor", async () => {
    const challenge = vi.fn(async () => ({ data: { id: "challenge-1" }, error: null }));
    const verify = vi.fn(async () => ({ data: {}, error: null }));
    const service = new AuthService({ auth: { mfa: { challenge, verify } } } as any);

    await service.verifyMfa("factor-1", "123456");

    expect(challenge).toHaveBeenCalledWith({ factorId: "factor-1" });
    expect(verify).toHaveBeenCalledWith({
      factorId: "factor-1",
      challengeId: "challenge-1",
      code: "123456",
    });
  });
});
