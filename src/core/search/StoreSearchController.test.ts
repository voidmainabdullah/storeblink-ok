import { describe, expect, it } from "vitest";
import {
  createStoreSearchRequest,
  normalizeStoreSearchQuery,
} from "./StoreSearchController";

describe("StoreSearchController", () => {
  it("normalizes user input and constrains pagination at the core boundary", () => {
    expect(normalizeStoreSearchQuery("  oak   lounge   chair  ")).toBe(
      "oak lounge chair",
    );
    expect(createStoreSearchRequest("store-1", {
      query: "  oak   chair ",
      sort: "price-asc",
      page: -4,
      pageSize: 500,
    })).toEqual({
      storeId: "store-1",
      search: "oak chair",
      sort: "price-asc",
      page: 1,
      pageSize: 100,
    });
  });
});
