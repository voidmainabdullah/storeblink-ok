import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StorefrontHead } from "./StorefrontHead";

const clearSeoHead = () => {
  document.head.querySelectorAll("[data-storeblink-edge-seo], [data-storeblink-seo]")
    .forEach((element) => element.remove());
};

describe("StorefrontHead", () => {
  afterEach(() => {
    clearSeoHead();
    document.title = "";
    window.history.replaceState({}, "", "/");
  });

  it("preserves a custom-domain canonical on the matching platform storefront route", () => {
    window.history.replaceState({}, "", "/store/acme/products/watch");
    document.title = "Registry product title";
    document.head.insertAdjacentHTML(
      "beforeend",
      '<meta data-storeblink-edge-seo="route" name="storeblink:edge-route" content="/store/acme/products/watch">' +
        '<link data-storeblink-edge-seo="canonical" rel="canonical" href="https://shop.example.com/products/watch">' +
        '<meta data-storeblink-edge-seo="description" name="description" content="Registry description">',
    );

    const view = render(
      <StorefrontHead
        title="Fallback title"
        description="Fallback description"
        canonicalUrl="http://localhost:3000/store/acme/products/watch"
      />,
    );

    expect(document.title).toBe("Registry product title");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content"))
      .toBe("Registry description");
    view.unmount();
    expect(document.head.querySelector('[data-storeblink-edge-seo="canonical"]')).not.toBeNull();
  });

  it("replaces stale edge metadata after client-side navigation", () => {
    window.history.replaceState({}, "", "/products/new");
    document.title = "Old product";
    document.head.insertAdjacentHTML(
      "beforeend",
      '<meta data-storeblink-edge-seo="route" name="storeblink:edge-route" content="/products/old">' +
        '<link data-storeblink-edge-seo="canonical" rel="canonical" href="https://shop.example.com/products/old">',
    );

    render(
      <StorefrontHead
        title="New product"
        description="New description"
        canonicalUrl="https://shop.example.com/products/new"
      />,
    );

    expect(document.title).toBe("New product");
    expect(document.head.querySelector('[data-storeblink-edge-seo="canonical"]')).toBeNull();
    expect(document.head.querySelector<HTMLLinkElement>('[data-storeblink-seo="canonical"]')?.href)
      .toBe("https://shop.example.com/products/new");
  });
});
