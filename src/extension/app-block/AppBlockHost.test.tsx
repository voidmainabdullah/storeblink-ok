import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppBlockHost } from "./AppBlockHost";
import { createAppBlockFrameDocument } from "./AppBlockFrameDocument";
import { createExtensionGrant, createExtensionManifest } from "./testFixtures";

describe("AppBlockHost", () => {
  it("uses an opaque script-only frame with no arbitrary network or eval policy", () => {
    render(<AppBlockHost
      manifest={createExtensionManifest()}
      grant={createExtensionGrant()}
      blockId="product-card"
      data={{ product: { id: "product-one", title: "Product", price: "$10" } }}
      onAction={vi.fn()}
    />);
    const frame = screen.getByTitle("Product promotion");
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame).not.toHaveAttribute("allow-same-origin");
    expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
    const srcDoc = frame.getAttribute("srcdoc") ?? "";
    expect(srcDoc).toContain("connect-src 'none'");
    expect(srcDoc).toContain("navigate-to 'none'");
    expect(srcDoc).not.toContain("unsafe-eval");
    expect(srcDoc).not.toContain("https:");
    expect(srcDoc).not.toContain("new Function");
  });

  it("rejects invalid session tokens when constructing the document", () => {
    expect(() => createAppBlockFrameDocument("predictable"))
      .toThrow(/256-bit/);
  });
});
