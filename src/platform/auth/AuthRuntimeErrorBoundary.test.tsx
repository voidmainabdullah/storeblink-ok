import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthRuntimeErrorBoundary } from "./AuthRuntimeErrorBoundary";

const BrokenAuthRuntime = () => {
  throw new Error("Supabase browser configuration is missing.");
};

describe("AuthRuntimeErrorBoundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("contains initialization failures instead of crashing the route", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <AuthRuntimeErrorBoundary>
        <BrokenAuthRuntime />
      </AuthRuntimeErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Authentication is temporarily unavailable",
    );
    expect(screen.getByRole("button", { name: "Reload" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
