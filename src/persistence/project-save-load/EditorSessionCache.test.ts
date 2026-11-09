import { describe, expect, it } from "vitest";
import { createEmptySceneTree } from "@/types";
import { EditorSessionCache, type EditorWarmSession } from "./EditorSessionCache";

const session = (storeId: string, updatedAt: number): EditorWarmSession => ({
  storeId,
  scene: createEmptySceneTree(),
  profile: {},
  storeItems: [],
  storeSlug: storeId,
  pageSnapshot: {},
  serverRevision: 1,
  dirty: true,
  activeBreakpoint: "desktop",
  viewport: { zoom: 1, pan: { x: 0, y: 0 } },
  updatedAt,
});

describe("EditorSessionCache", () => {
  it("returns the live session without cloning the Scene Graph", () => {
    const cache = new EditorSessionCache();
    const value = session("store-1", 100);
    cache.put(value);
    expect(cache.get("store-1", 200)).toBe(value);
    expect(cache.get("store-1", 200)?.scene).toBe(value.scene);
  });

  it("expires stale sessions and bounds memory usage", () => {
    const cache = new EditorSessionCache();
    for (let index = 0; index < 5; index += 1) {
      cache.put(session(`store-${index}`, 1_000 + index));
    }
    expect(cache.size()).toBe(4);
    expect(cache.get("store-0", 2_000)).toBeNull();
    expect(cache.get("store-4", 31 * 60 * 1_000)).toBeNull();
  });
});
