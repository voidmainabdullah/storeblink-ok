import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const authValue = vi.hoisted(() => ({
  currentStore: { name: "Test store" },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authValue }));

import DomainConnectLayout from "./DomainConnectLayout";

describe("DomainConnectLayout", () => {
  it("renders dashboard navigation without nested anchors", () => {
    const { container } = render(
      <MemoryRouter>
        <DomainConnectLayout />
      </MemoryRouter>,
    );

    expect(container.querySelector("a a")).toBeNull();
    expect(screen.getByRole("link", { name: "Storeblink dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Provisioning" })).toHaveAttribute("href", "/domain/connect/status");
    expect(screen.getByText("Test store")).toBeVisible();
  });
});
