import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ThemeStudioAccessBoundary,
} from "./ThemeStudioRoute";
import { THEME_STUDIO_ROUTE_POLICY } from "./themeStudioRoutePolicy";

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("@/platform/auth/AuthProvider", () => ({ useAuth: () => auth.value }));

const baseAuth = (overrides: Record<string, unknown> = {}) => ({
  loading: false,
  user: { id: "user-1" },
  currentStore: { id: "store-1" },
  assuranceLevel: "aal2",
  error: null,
  hasCapability: (capability: string) => capability === "theme.studio",
  refreshAuthorization: vi.fn(),
  signOut: vi.fn(),
  ...overrides,
});

const MfaLocation = () => {
  const location = useLocation();
  return <div>AAL2 challenge {location.search}</div>;
};

const renderBoundary = () => render(
  <MemoryRouter initialEntries={["/dashboard/theme-studio"]}>
    <Routes>
      <Route path="/dashboard/theme-studio" element={(
        <ThemeStudioAccessBoundary><div>Theme Studio allowed</div></ThemeStudioAccessBoundary>
      )} />
      <Route path="/auth/mfa" element={<MfaLocation />} />
    </Routes>
  </MemoryRouter>,
);

describe("Theme Studio route policy", () => {
  beforeEach(() => { auth.value = baseAuth(); });

  it("declares store, theme.studio, and AAL2 requirements", () => {
    expect(THEME_STUDIO_ROUTE_POLICY).toEqual({
      capabilities: ["theme.studio"],
      requireStore: true,
      requireAal2: true,
    });
  });

  it("is wired as a separate dashboard route without replacing the Store editor", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(appSource).toContain('path="theme-studio" element={<ThemeStudioRoute />}');
    expect(appSource).toContain('path="/dashboard/store"');
    expect(appSource).toContain('<AuthGuard capabilities={["theme.read"]} requireStore><MyStore /></AuthGuard>');
  });

  it("redirects an AAL1 session to MFA with the protected return path", () => {
    auth.value = baseAuth({ assuranceLevel: "aal1" });
    renderBoundary();
    expect(screen.getByText(/AAL2 challenge/)).toHaveTextContent(
      "returnTo=%2Fdashboard%2Ftheme-studio",
    );
  });

  it("denies a session without theme.studio", () => {
    auth.value = baseAuth({ hasCapability: () => false });
    renderBoundary();
    expect(screen.getByRole("heading", { name: "Store access unavailable" })).toBeVisible();
    expect(screen.queryByText("Theme Studio allowed")).not.toBeInTheDocument();
  });

  it("renders only when store, capability, and AAL2 checks pass", () => {
    renderBoundary();
    expect(screen.getByText("Theme Studio allowed")).toBeVisible();
  });
});
