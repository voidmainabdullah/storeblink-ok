import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dashboard: {} as Record<string, unknown>,
}));

vi.mock("@/domains/ui/useDomainDashboard", () => ({
  useDomainDashboard: () => state.dashboard,
  useDomainDashboardMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  domainDashboardKey: (storeId: string | undefined) => ["domain-dashboard", storeId ?? "no-store"],
}));

import GoogleSearchPage from "./GoogleSearchPage";

const workflowRow = (label: string) => screen.getByText(label).closest("li") as HTMLElement;

describe("GoogleSearchPage", () => {
  it("projects workflow state from the active primary domain records", () => {
    const domainId = "11111111-1111-4111-8111-111111111111";
    state.dashboard = {
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      data: {
        capabilities: {
          googleSearch: {
            available: false,
            reason: "Google OAuth automation is not enabled.",
          },
        },
        google: { status: "connected" },
        domains: [{ id: domainId, hostname: "shop.example.com", is_primary: true, status: "active" }],
        siteVerifications: [{ domain_id: domainId, status: "verified" }],
        searchConsoleProperties: [{ domain_id: domainId, status: "active" }],
        sitemapSubmissions: [{ domain_id: domainId, status: "submitted" }],
        searchMetrics: [],
        urlInspectionResults: [],
      },
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <GoogleSearchPage />
      </QueryClientProvider>,
    );

    expect(within(workflowRow("Primary domain active")).getByText("Ready")).toBeVisible();
    expect(within(workflowRow("Merchant Google consent")).getByText("Granted")).toBeVisible();
    expect(within(workflowRow("Site ownership verification")).getByText("Verified")).toBeVisible();
    expect(within(workflowRow("Search Console property")).getByText("Active")).toBeVisible();
    expect(within(workflowRow("Sitemap submission")).getByText("Submitted")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Google Search setup unavailable");
    expect(screen.queryByRole("button", { name: /connect/i })).not.toBeInTheDocument();
  });

  it("explains Google's granular Search permissions before connection", () => {
    const domainId = "22222222-2222-4222-8222-222222222222";
    state.dashboard = {
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      store: { id: "33333333-3333-4333-8333-333333333333" },
      data: {
        capabilities: { googleSearch: { available: true, reason: null } },
        google: { status: "disconnected" },
        domains: [{ id: domainId, hostname: "shop.example.com", is_primary: true, status: "active" }],
        siteVerifications: [],
        searchConsoleProperties: [],
        sitemapSubmissions: [],
        searchMetrics: [],
        urlInspectionResults: [],
      },
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <GoogleSearchPage />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("button", { name: "Connect Google" })).toBeEnabled();
    expect(screen.getByText(/keep both Site Verification and Search Console selected/i)).toBeVisible();
  });
});
