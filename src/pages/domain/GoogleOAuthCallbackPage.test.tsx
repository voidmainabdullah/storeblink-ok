import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ currentStore: { id: "11111111-1111-4111-8111-111111111111" } }),
}));

vi.mock("@/domains/DomainService", () => ({
  domainService: { completeGoogleConnection: mocks.complete },
}));

import GoogleOAuthCallbackPage from "./GoogleOAuthCallbackPage";

describe("GoogleOAuthCallbackPage", () => {
  beforeEach(() => {
    mocks.complete.mockReset();
    mocks.complete.mockResolvedValue({ storeId: "11111111-1111-4111-8111-111111111111" });
  });

  it("exchanges the provider callback once and returns to Google Search", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/domain/connect/google/callback?code=provider-code&state=opaque-state"]}>
          <Routes>
            <Route path="/domain/connect/google/callback" element={<GoogleOAuthCallbackPage />} />
            <Route path="/domain/connect/google" element={<div>Google Search dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(mocks.complete).toHaveBeenCalledTimes(1));
    expect(mocks.complete).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "provider-code",
      "opaque-state",
    );
    expect(await screen.findByText("Google Search dashboard")).toBeVisible();
  });

  it("does not call the backend after the merchant denies consent", async () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/domain/connect/google/callback?error=access_denied"]}>
          <Routes>
            <Route path="/domain/connect/google/callback" element={<GoogleOAuthCallbackPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Google access was not granted");
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
