import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dashboard: {} as Record<string, unknown>,
  connectMutate: vi.fn(),
  checkMutate: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("@/domains", () => ({
  domainService: { connectExisting: vi.fn() },
  normalizeDomainHostname: (hostname: string) => hostname,
}));
vi.mock("@/domains/ui/useDomainDashboard", () => ({
  useDomainDashboard: () => state.dashboard,
  useDomainDashboardMutation: (_fn: unknown, message: string) => ({
    mutate: message === "Connection check started" ? state.checkMutate : state.connectMutate,
    isPending: false,
  }),
}));

import ConnectExistingDomainPage from "./ConnectExistingDomainPage";

describe("ConnectExistingDomainPage", () => {
  it("describes a provider configuration gate without implying a service outage", () => {
    state.dashboard = {
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      data: {
        capabilities: {
          existingDomain: {
            available: false,
            reason: "Cloudflare for SaaS credentials are not configured.",
          },
        },
        domains: [],
      },
    };

    render(<ConnectExistingDomainPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("Connection setup required");
    expect(screen.getByRole("alert")).toHaveTextContent("Cloudflare for SaaS credentials are not configured.");
    expect(screen.queryByText("Connection service unavailable")).not.toBeInTheDocument();
  });

  it("shows the exact CNAME recipe and explicitly queues a provider recheck", () => {
    state.checkMutate.mockReset();
    state.dashboard = {
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
      data: {
        capabilities: { existingDomain: { available: true, reason: null } },
        domains: [{
          id: "22222222-2222-4222-8222-222222222222",
          hostname: "shop.example.com",
          status: "verification_pending",
          verification: {
            record_type: "CNAME",
            record_name: "shop.example.com",
            record_value: "domains.storeblink.com",
          },
        }],
      },
    };

    render(<ConnectExistingDomainPage />);

    expect(screen.getAllByText("shop.example.com", { selector: "code" })).toHaveLength(2);
    expect(screen.getByText("domains.storeblink.com")).toBeInTheDocument();
    expect(screen.getByText("Auto (or 300 seconds)")).toBeInTheDocument();
    expect(screen.getByText(/DNS only/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
    expect(state.checkMutate).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
  });
});
