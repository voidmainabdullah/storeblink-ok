import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeCommerceMenu } from "./ThemeCommerceMenu";

const products = [
  {
    id: "watch-one",
    name: "Classic Watch",
    category: "Classic",
    description: "Steel automatic watch",
    image_url: "https://example.com/watch.jpg",
    images: [],
    is_published: true,
    price_cents: 12000,
    original_price_cents: null,
    stock: 5,
  },
  {
    id: "sport-one",
    name: "Sport Watch",
    category: "Sport",
    description: "Water resistant watch",
    image_url: null,
    images: [],
    is_published: true,
    price_cents: 8000,
    original_price_cents: null,
    stock: 8,
  },
];

describe("ThemeCommerceMenu", () => {
  it("searches real products and submits a category-aware catalog route", () => {
    const onBrowse = vi.fn();
    render(
      <ThemeCommerceMenu
        mode="search"
        products={products}
        maximumSuggestions={6}
        accent="#111111"
        onClose={vi.fn()}
        onBrowse={onBrowse}
        onProduct={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/search by product/i), {
      target: { value: "sport" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sport", pressed: false }));
    expect(screen.getByRole("button", { name: /sport watch/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /classic watch/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /view all results/i }));
    expect(onBrowse).toHaveBeenCalledWith("sport", "Sport");
  });
});
