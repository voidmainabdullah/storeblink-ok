import { describe, expect, it } from "vitest";
import {
  DomainValidationError,
  normalizeDomainHostname,
  normalizeDomainSearchName,
} from "./DomainValidator";

describe("DomainValidator", () => {
  it("normalizes a URL and international hostname to canonical ASCII", () => {
    expect(normalizeDomainHostname(" HTTPS://BÜCHER.example.de/ "))
      .toBe("xn--bcher-kva.example.de");
  });

  it.each([
    "localhost",
    "example.com",
    "store.local",
    "https://shop.example.com/path",
    "https://user:pass@shop.example.com",
    "shop.example.com:8443",
    "-bad.example.com",
  ])("rejects unsafe or non-public hostname %s", (value) => {
    expect(() => normalizeDomainHostname(value)).toThrow(DomainValidationError);
  });

  it("normalizes a search term without its extension", () => {
    expect(normalizeDomainSearchName("Store-Blink.com")).toBe("store-blink");
  });
});
