import { describe, expect, it, vi } from "vitest";
import { TaggedCache } from "./TaggedCache";

describe("TaggedCache", () => {
  it("expires entries and invalidates only matching tags", () => {
    let now = 100;
    const cache = new TaggedCache({ now: () => now, defaultTtlMs: 20 });
    cache.set("store:a", "a", { tags: ["store:a"] });
    cache.set("store:b", "b", { tags: ["store:b"] });

    expect(cache.invalidateTag("store:a")).toBe(1);
    expect(cache.get("store:a")).toBeUndefined();
    expect(cache.get("store:b")).toBe("b");

    now = 121;
    expect(cache.get("store:b")).toBeUndefined();
  });

  it("deduplicates concurrent loads", async () => {
    const cache = new TaggedCache();
    const loader = vi.fn(async () => ({ id: "one" }));

    const [first, second] = await Promise.all([
      cache.getOrLoad("profile", loader),
      cache.getOrLoad("profile", loader),
    ]);

    expect(first).toEqual({ id: "one" });
    expect(second).toBe(first);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("evicts the least recently used entry", () => {
    const cache = new TaggedCache({ maxEntries: 2 });
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });
});
