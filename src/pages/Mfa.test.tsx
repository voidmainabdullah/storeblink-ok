import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  assuranceLevel: "aal1" as const,
  listMfaFactors: vi.fn(),
  enrollTotp: vi.fn(),
  verifyMfa: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authMock,
}));

import Mfa from "./Mfa";

describe("Mfa domain access guidance", () => {
  beforeEach(() => {
    authMock.listMfaFactors.mockReset().mockResolvedValue([]);
    authMock.enrollTotp.mockReset().mockResolvedValue({
      factorId: "factor-1",
      qrCode: "data:image/svg+xml;base64,PHN2Zy8+",
      secret: "TESTSECRET",
      uri: "otpauth://totp/StoreBlink:test",
    });
    authMock.verifyMfa.mockReset();
    authMock.signOut.mockReset();
  });

  it("explains why and how an authenticator is used before domain access", async () => {
    render(
      <MemoryRouter initialEntries={["/auth/mfa?returnTo=%2Fdomain%2Fconnect"]}>
        <Routes><Route path="/auth/mfa" element={<Mfa />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Secure domain access" })).toBeVisible();
    expect(screen.getByText(/stolen password alone cannot redirect your storefront/i)).toBeVisible();
    expect(screen.getByText(/choose Scan QR code/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Set up authenticator" }));

    expect(await screen.findByRole("img", { name: "StoreBlink authenticator setup QR code" })).toBeVisible();
    expect(screen.getByText(/does not connect a domain, change DNS, or charge you/i)).toBeVisible();
    expect(screen.getByText(/upgraded to AAL2 and returns to Domain Connect/i)).toBeVisible();
    await waitFor(() => expect(authMock.enrollTotp).toHaveBeenCalledTimes(1));
  });

  it("explains why an enrolled account does not receive another QR code", async () => {
    authMock.listMfaFactors.mockResolvedValueOnce([{
      id: "factor-1",
      status: "verified",
      factorType: "totp",
      friendlyName: "Phone",
    }]);

    render(
      <MemoryRouter initialEntries={["/auth/mfa?returnTo=%2Fdomain%2Fconnect"]}>
        <Routes><Route path="/auth/mfa" element={<Mfa />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText("Six-digit verification code")).toBeVisible();
    expect(screen.getByText(/QR code appears only during first-time setup/i)).toBeVisible();
    expect(screen.getByText(/already has a verified authenticator/i)).toBeVisible();
  });
});
