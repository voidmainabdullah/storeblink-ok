import { describe, expect, it } from "vitest";
import {
  missingGoogleRequiredScopes,
  normalizeGoogleGrantedScopes,
} from "../../supabase/functions/_shared/domain/google";

const searchScopes = [
  "openid",
  "https://www.googleapis.com/auth/siteverification",
  "https://www.googleapis.com/auth/webmasters",
] as const;

describe("Google OAuth scope validation", () => {
  it("accepts Google's canonical userinfo email scope as the email permission", () => {
    expect(missingGoogleRequiredScopes([
      ...searchScopes,
      "https://www.googleapis.com/auth/userinfo.email",
    ])).toEqual([]);
  });

  it("accepts the short OpenID email scope", () => {
    expect(missingGoogleRequiredScopes([...searchScopes, "email"])).toEqual([]);
  });

  it("keeps Site Verification and Search Console grants mandatory", () => {
    expect(missingGoogleRequiredScopes(["openid", "email"])).toEqual([
      "https://www.googleapis.com/auth/siteverification",
      "https://www.googleapis.com/auth/webmasters",
    ]);
  });

  it("normalizes aliases without duplicating granted scopes", () => {
    expect(normalizeGoogleGrantedScopes([
      "email",
      "https://www.googleapis.com/auth/userinfo.email",
      "email",
    ])).toEqual([
      "email",
      "https://www.googleapis.com/auth/userinfo.email",
    ]);
  });
});
