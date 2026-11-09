import { beforeEach, describe, expect, it } from "vitest";
import { usePaletteStore } from "@/stores/palette.store";
import { PaletteSystem } from "./PaletteSystem";

describe("PaletteSystem", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePaletteStore.setState({ recentColors: [], brandColors: [] });
  });

  it("normalizes, de-duplicates, and persists recent and brand colors", () => {
    const palette = new PaletteSystem();
    palette.hydrate();
    palette.recordColor("#abc");
    palette.recordColor("#AABBCC");
    palette.setBrandColors(["#0178ff", "invalid"]);

    expect(usePaletteStore.getState().recentColors).toEqual(["#AABBCC"]);
    expect(usePaletteStore.getState().brandColors).toEqual(["#0178FF"]);
    expect(JSON.parse(window.localStorage.getItem("storeblink.editor.recent-colors") ?? "[]")).toEqual(["#AABBCC"]);
  });
});
