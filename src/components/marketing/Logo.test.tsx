import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BrandLogo, Logo } from "./Logo";

describe("StoreBlink logo", () => {
  it("uses the shared full brand lockup for linked light surfaces", () => {
    render(
      <MemoryRouter>
        <Logo to="/dashboard" ariaLabel="StoreBlink dashboard" />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "StoreBlink dashboard" });
    const image = link.querySelector<HTMLImageElement>("img");

    expect(link).toHaveAttribute("href", "/dashboard");
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute("width", "1882");
    expect(image?.getAttribute("src")).toContain("storeblink-logo");
  });

  it("uses the legible lockup variant on dark surfaces", () => {
    render(<BrandLogo inverted alt="StoreBlink inverted logo" />);

    const image = screen.getByRole("img", { name: "StoreBlink inverted logo" });
    expect(image.getAttribute("src")).toContain("storeblink-logo-inverted");
  });
});
