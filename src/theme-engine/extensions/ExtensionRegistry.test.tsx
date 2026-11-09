import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExtensionRegistry,
  ExtensionSlot,
  storefrontExtensionRegistry,
} from "./ExtensionRegistry";

afterEach(() => {
  storefrontExtensionRegistry.clear();
  vi.restoreAllMocks();
});

describe("ExtensionRegistry", () => {
  it("filters extensions by target, page type and conditions", () => {
    const registry = new ExtensionRegistry();
    const renderer = () => null;
    registry.register({
      id: "product-details",
      version: "1.0.0",
      target: "product-details",
      renderer,
      supportedPageTypes: ["product"],
      enabled: ({ productId }) => Boolean(productId),
    });

    expect(registry.resolve("product-details", {
      pageType: "product",
      productId: "p1",
    })).toHaveLength(1);
    expect(registry.resolve("product-details", {
      pageType: "home",
      productId: "p1",
    })).toHaveLength(0);
  });

  it("isolates a failed extension without hiding healthy extensions", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    storefrontExtensionRegistry.register({
      id: "broken",
      version: "1.0.0",
      target: "main-after",
      renderer: () => {
        throw new Error("Extension failed");
      },
    });
    storefrontExtensionRegistry.register({
      id: "healthy",
      version: "1.0.0",
      target: "main-after",
      renderer: () => <span>Healthy extension</span>,
    });

    render(<ExtensionSlot target="main-after" />);

    expect(screen.getByText("Healthy extension")).toBeInTheDocument();
  });

  it("enforces extension trust and count limits in production", () => {
    const registry = new ExtensionRegistry({
      requireTrustedExtensions: true,
      maximumExtensions: 1,
      verifySignedExtension: (_extension, provenance) =>
        provenance.signature === "valid",
    });
    expect(() =>
      registry.register({
        id: "development",
        version: "1.0.0",
        target: "main-after",
        renderer: () => null,
      }),
    ).toThrow(/untrusted/i);

    registry.register({
      id: "signed",
      version: "1.0.0",
      target: "main-after",
      renderer: () => null,
      provenance: {
        source: "signed",
        publisher: "StoreBlink Partner",
        keyId: "partner-key",
        signature: "valid",
      },
    });
    expect(() =>
      registry.register({
        id: "second",
        version: "1.0.0",
        target: "main-before",
        renderer: () => null,
        provenance: { source: "platform" },
      }),
    ).toThrow(/limit/i);
  });
});
