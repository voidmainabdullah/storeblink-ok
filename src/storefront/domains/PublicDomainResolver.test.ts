import { describe, expect, it } from "vitest";
import { isPlatformHostname, normalizeRequestHostname } from "./PublicDomainResolver";

describe("PublicDomainResolver host classification", () => {
  it("keeps platform and preview hosts on platform routes", () => {
    expect(isPlatformHostname("localhost")).toBe(true);
    expect(isPlatformHostname("storeblink.com")).toBe(true);
    expect(isPlatformHostname("preview.vercel.app")).toBe(true);
  });

  it("classifies merchant domains as custom storefront hosts", () => {
    expect(isPlatformHostname("shop.merchant.com")).toBe(false);
  });

  it("normalizes host casing and a trailing dot", () => {
    expect(normalizeRequestHostname("SHOP.MERCHANT.COM.")).toBe("shop.merchant.com");
  });
});
