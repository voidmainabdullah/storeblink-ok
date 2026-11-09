import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { createSceneNode } from "@/engine/scene-graph";
import { resolveTheme } from "@/lib/storeTheme";
import { ContactPage, routeForNode } from "./Store";

const linkNode = (target: string) =>
  createSceneNode(
    {
      id: `link-${target}`,
      type: "button",
      name: "Navigation link",
      props: { label: "Link" },
      extensions: { navigationTarget: target },
    },
    null,
    1,
  );

describe("storefront navigation routing", () => {
  it("keeps default and custom paths inside the active store", () => {
    expect(routeForNode("north", linkNode("home"))).toBe("/store/north");
    expect(routeForNode("north", linkNode("/pages/lookbook"))).toBe("/store/north/pages/lookbook");
    expect(routeForNode("north", linkNode("pages/journal"))).toBe("/store/north/pages/journal");
  });

  it("preserves intentional external destinations", () => {
    expect(routeForNode("north", linkNode("https://example.com"))).toBe("https://example.com");
  });
});

describe("storefront contact integrity", () => {
  it("does not render a submission form or claim that an unavailable message was sent", () => {
    render(
      createElement(ContactPage, {
        profile: {
          id: "store-1",
          business_name: "North",
          store_slug: "north",
          theme: {},
        },
        theme: resolveTheme({}),
      }),
    );

    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send message/i })).not.toBeInTheDocument();
    expect(screen.getByText("Contact form unavailable")).toBeInTheDocument();
    expect(screen.getByText(/No message has been sent or stored/i)).toBeInTheDocument();
  });
});
