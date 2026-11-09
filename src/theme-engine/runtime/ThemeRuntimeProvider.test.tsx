import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createSceneNode } from "@/engine/scene-graph";
import { ensureBuiltInThemePackages } from "@/themes/registerBuiltInThemePackages";
import { ThemeRuntimeProvider } from "./ThemeRuntimeProvider";
import { ThemeSectionBoundary } from "./ThemeSectionBoundary";

const section = createSceneNode(
  {
    id: "runtime-section",
    type: "section",
    name: "Runtime section",
    transform: { width: 400, height: 200 },
    extensions: {
      themeId: "atelier",
      canonicalSectionType: "editorial-intro",
    },
  },
  null,
  1,
);

describe("ThemeRuntimeProvider", () => {
  it("lazy-loads the active theme and uses the same section renderer in editor and storefront modes", async () => {
    ensureBuiltInThemePackages();
    const { rerender } = render(
      <ThemeRuntimeProvider themeId="atelier" mode="editor">
        <ThemeSectionBoundary node={section}>
          <span>Shared content</span>
        </ThemeSectionBoundary>
      </ThemeRuntimeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Shared content").closest("section")).toHaveAttribute(
        "data-theme-id",
        "atelier",
      );
    });

    rerender(
      <ThemeRuntimeProvider themeId="atelier" mode="storefront">
        <ThemeSectionBoundary node={section}>
          <span>Shared content</span>
        </ThemeSectionBoundary>
      </ThemeRuntimeProvider>,
    );

    expect(screen.getByText("Shared content").closest("section")).toHaveAttribute(
      "data-theme-id",
      "atelier",
    );
  });
});
