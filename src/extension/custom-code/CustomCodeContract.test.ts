import { describe, expect, it } from "vitest";
import {
  assertCustomCodeSource,
  createDefaultCustomCodeProps,
  CUSTOM_CODE_NODE_TYPE,
  hashCustomCode,
  parseCustomCodeProps,
} from "./CustomCodeContract";

describe("CustomCodeContract", () => {
  it("creates a deterministic, precompiled custom Scene Graph node payload", () => {
    const props = createDefaultCustomCodeProps();

    expect(CUSTOM_CODE_NODE_TYPE).toBe("custom:code");
    expect(props.source).toContain("StoreBlink.render");
    expect(props.compiledJs).toContain("React.createElement");
    expect(props.sourceHash).toBe(hashCustomCode(props.source, props.css));
    expect(parseCustomCodeProps(props)).toEqual(props);
  });

  it("rejects remote module syntax before compiler execution", () => {
    expect(() => assertCustomCodeSource('import React from "https://example.com/react";', ""))
      .toThrow(/Module imports are not available/);
    expect(() => assertCustomCodeSource("StoreBlink.render(<main />);", "body{}"))
      .not.toThrow();
  });

  it("accepts persisted React JavaScript sections", () => {
    const props = createDefaultCustomCodeProps();
    expect(parseCustomCodeProps({ ...props, language: "jsx" }).language).toBe("jsx");
  });
});
