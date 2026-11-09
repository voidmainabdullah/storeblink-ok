import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
  },
}));

import { EditorStoreDataService } from "./EditorStoreDataService";

const STORE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";

const profile = {
  id: USER_ID,
  business_name: "Selected store",
  store_tagline: null,
  store_about: null,
  store_color: "#111111",
  store_banner_url: null,
  store_slug: "selected-store",
  theme: null,
  theme_draft: { engine_scene: {} },
  theme_published: null,
  theme_revision: 4,
  categories: ["Watches"],
};

describe("EditorStoreDataService", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.from.mockReset();
  });

  it("loads the selected store and applies the same explicit tenant filter to products", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: profile, error: null });
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      limit: vi.fn(async () => ({ data: [], error: null })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);

    const service = new EditorStoreDataService();
    const result = await service.load({ id: USER_ID } as any, STORE_ID);

    expect(mocks.rpc).toHaveBeenCalledWith("get_editor_store_document", { p_store_id: STORE_ID });
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("sold_count"));
    expect(query.eq).toHaveBeenCalledWith("store_id", STORE_ID);
    expect(result.profile.categories).toEqual(["Watches"]);
  });

  it("preserves PostgREST error details instead of collapsing them to a generic load error", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: profile, error: null });
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      limit: vi.fn(async () => ({
        data: null,
        error: { code: "42703", message: "column items.sold_count does not exist" },
      })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);

    const service = new EditorStoreDataService();

    await expect(service.load({ id: USER_ID } as any, STORE_ID)).rejects.toMatchObject({
      name: "SupabaseOperationError",
      code: "42703",
      message: expect.stringContaining("items.sold_count"),
    });
  });

  it("saves generated content through the store-scoped capability RPC", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { revision: 5, persisted_at: "2026-08-09T00:00:00.000Z" },
      error: null,
    });
    const service = new EditorStoreDataService();
    const document = { engine_scene: { rootNodeId: null, nodes: {} } };

    await expect(service.saveGeneratedDraft({
      storeId: STORE_ID,
      document,
      expectedRevision: 4,
      businessName: "Selected store",
      storeTagline: "Modern goods",
      storeAbout: null,
      storeColor: "#111111",
      storeBannerUrl: null,
    })).resolves.toEqual({
      revision: 5,
      persistedAt: "2026-08-09T00:00:00.000Z",
    });

    expect(mocks.rpc).toHaveBeenCalledWith("save_generated_storefront_draft", {
      p_store_id: STORE_ID,
      p_document: document,
      p_expected_revision: 4,
      p_business_name: "Selected store",
      p_store_tagline: "Modern goods",
      p_store_about: null,
      p_store_color: "#111111",
      p_store_banner_url: null,
    });
  });
});
