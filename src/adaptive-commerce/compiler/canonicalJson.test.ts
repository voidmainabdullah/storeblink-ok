import { describe, expect, it } from "vitest";
import { canonicalJson, CanonicalJsonError } from "./canonicalJson";
import { artifactHashFor, sha256Hex } from "./sha256";

describe("canonical artifact serialization", () => {
  it("sorts object keys recursively while retaining array order", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 1 }, list: [{ b: 2, a: 1 }] }))
      .toBe('{"a":{"x":1,"y":2},"list":[{"a":1,"b":2}],"z":1}');
  });

  it("rejects values JSON would otherwise discard or corrupt", () => {
    expect(() => canonicalJson({ missing: undefined })).toThrow(CanonicalJsonError);
    expect(() => canonicalJson({ invalid: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => canonicalJson(circular)).toThrow(/circular/);
  });

  it("implements the SHA-256 reference vector and stable artifact hashes", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(artifactHashFor({ b: 2, a: 1 })).toBe(artifactHashFor({ a: 1, b: 2 }));
    expect(artifactHashFor({ a: 1 })).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
