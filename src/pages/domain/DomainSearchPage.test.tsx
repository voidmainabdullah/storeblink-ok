import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dashboard: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ currentStore: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked }: { checked?: boolean }) => <input type="checkbox" checked={checked} readOnly />,
}));
vi.mock("@/domains", () => ({
  domainService: {
    search: vi.fn(),
    claimIncludedDomain: vi.fn(),
    purchaseDomain: vi.fn(),
  },
  mapDomainError: (error: unknown) => error,
  normalizeDomainSearchName: (name: string) => name,
}));
vi.mock("@/domains/ui/useDomainDashboard", () => ({
  useDomainDashboard: () => state.dashboard,
  useDomainDashboardMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import DomainSearchPage from "./DomainSearchPage";

const dashboard = (
  domainSearch: { available: boolean; reason: string | null },
  includedRegistration: { available: boolean; reason: string | null },
  paidRegistration: { available: boolean; reason: string | null },
) => ({
  isLoading: false,
  error: null,
  refetch: vi.fn(),
  data: {
    capabilities: { domainSearch, includedRegistration, paidRegistration },
  },
});

describe("DomainSearchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows one registrar setup warning and suppresses dependent registration warnings", () => {
    state.dashboard = dashboard(
      { available: false, reason: "Registrar credentials are not configured." },
      { available: false, reason: "This registrar account does not have an enabled included-domain claim workflow." },
      { available: false, reason: "Registrar credentials are not configured." },
    );

    render(<DomainSearchPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("Registrar setup required");
    expect(screen.getAllByText("Registrar credentials are not configured.")).toHaveLength(1);
    expect(screen.queryByText("Registration options")).not.toBeInTheDocument();
    expect(screen.queryByText(/included-domain claim workflow/i)).not.toBeInTheDocument();
  });

  it("deduplicates unavailable registration reasons when registrar search works", () => {
    state.dashboard = dashboard(
      { available: true, reason: null },
      { available: false, reason: "Registration is disabled for this account." },
      { available: false, reason: "Registration is disabled for this account." },
    );

    render(<DomainSearchPage />);

    expect(screen.getByText("Registration options")).toBeVisible();
    expect(screen.getAllByText("Registration is disabled for this account.")).toHaveLength(1);
    expect(screen.queryByText("Registrar setup required")).not.toBeInTheDocument();
  });
});
