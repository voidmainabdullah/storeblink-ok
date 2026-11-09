import { afterEach, describe, expect, it, vi } from "vitest";
import { publicSupabaseRequest } from "./publicRest";

describe("publicSupabaseRequest", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses only the publishable API key and never requests a merchant session", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(JSON.stringify([{ id: "store" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await publicSupabaseRequest("rpc/get_public_storefront", {
      method: "POST",
      body: JSON.stringify({ p_handle: "store" }),
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("apikey")).toBeTruthy();
    expect(headers.has("authorization")).toBe(false);
  });
});
