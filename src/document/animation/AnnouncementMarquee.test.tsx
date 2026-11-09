import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SceneRenderProvider } from "@/rendering/renderer";
import { buildAtelierTemplateScene } from "@/themes/atelier/templates/home";
import { AnnouncementMarquee } from "./AnnouncementMarquee";
import { animationSystem } from "./AnimationSystem";

describe("AnnouncementMarquee", () => {
  it("uses constant-distance timing", () => {
    expect(animationSystem.durationForDistance(480, 48)).toBe(10);
  });

  it("renders one semantic source, an aria-hidden visual copy, and pauses on focus", () => {
    const scene = buildAtelierTemplateScene(
      { business_name: "Atelier" },
      [],
    );
    const node = scene.nodes["atelier-announcement"];
    scene.nodes["atelier-announcement-one"].extensions = {
      ...(scene.nodes["atelier-announcement-one"].extensions ?? {}),
      navigationTarget: { type: "route", routeKey: "products" },
    };
    const { container } = render(
      <SceneRenderProvider
        scene={scene}
        breakpoint="desktop"
        linkContext={{ storeSlug: "demo" }}
      >
        <AnnouncementMarquee node={node} mode="storefront">
          <div>Editor children</div>
        </AnnouncementMarquee>
      </SceneRenderProvider>,
    );

    expect(screen.getAllByText("OBJECTS FOR QUIET LIVING")).toHaveLength(2);
    expect(
      container.querySelectorAll(
        '[data-announcement-marquee-group][aria-hidden="true"]',
      ),
    ).toHaveLength(1);
    const link = screen.getByRole("link", {
      name: "OBJECTS FOR QUIET LIVING",
    });
    expect(link).toHaveAttribute("href", "/store/demo/products");
    fireEvent.focus(link);
    expect(
      container.querySelector("[data-announcement-marquee]"),
    ).toHaveAttribute("data-marquee-paused", "true");
  });

  it("keeps original editable children in editor mode", () => {
    const scene = buildAtelierTemplateScene(
      { business_name: "Atelier" },
      [],
    );
    render(
      <SceneRenderProvider scene={scene} breakpoint="desktop">
        <AnnouncementMarquee
          node={scene.nodes["atelier-announcement"]}
          mode="editor"
        >
          <div>Editable source nodes</div>
        </AnnouncementMarquee>
      </SceneRenderProvider>,
    );

    expect(screen.getByText("Editable source nodes")).toBeInTheDocument();
    expect(
      document.querySelector("[data-announcement-marquee]"),
    ).not.toBeInTheDocument();
  });

  it("adds enough hidden copies to cover a wide viewport without a blank gap", async () => {
    const scene = buildAtelierTemplateScene(
      { business_name: "Atelier" },
      [],
    );
    scene.nodes["atelier-announcement"].props.direction = "right";
    const { container } = render(
      <SceneRenderProvider scene={scene} breakpoint="desktop">
        <AnnouncementMarquee
          node={scene.nodes["atelier-announcement"]}
          mode="storefront"
        >
          <div />
        </AnnouncementMarquee>
      </SceneRenderProvider>,
    );
    const viewport = container.querySelector<HTMLElement>(
      "[data-announcement-marquee]",
    )!;
    const semanticGroup = container.querySelector<HTMLElement>(
      '[data-announcement-marquee-group]:not([aria-hidden="true"])',
    )!.parentElement as HTMLElement;
    Object.defineProperty(viewport, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ width: 700, height: 40 }),
    });
    Object.defineProperty(semanticGroup, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ width: 200, height: 40 }),
    });

    fireEvent(window, new Event("resize"));

    await waitFor(() =>
      expect(
        container.querySelectorAll(
          '[data-announcement-marquee-group][aria-hidden="true"]',
        ),
      ).toHaveLength(5),
    );
    expect(
      container.querySelector<HTMLElement>(
        "[data-announcement-marquee-track]",
      )?.style.animationDirection,
    ).toBe("reverse");
  });
});
