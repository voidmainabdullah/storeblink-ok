import { describe, expect, it } from "vitest";
import { validateSceneTree } from "@/engine/validation";
import {
  CURRENT_ENGINE_DOCUMENT_VERSION,
  ENGINE_DOCUMENT_VERSION_KEY,
} from "@/engine/migration";
import { DEFAULT_THEME } from "@/lib/storeTheme";
import {
  buildStoreSceneTree,
  createEngineSceneTheme,
  ENGINE_SCENE_THEME_KEY,
  getRequiredEngineScene,
  getSavedEngineScene,
} from "./storeSceneAdapter";

describe("storeSceneAdapter", () => {
  it("builds a valid SceneTree from real store profile fields", () => {
    const tree = buildStoreSceneTree(
      {
        business_name: "EasyMart",
        store_tagline: "Fresh supplies",
        store_about: "Local commerce",
        store_color: "#0178ff",
        theme: {
          ...DEFAULT_THEME,
          text_overrides: { ...DEFAULT_THEME.text_overrides, heroCta: "Buy now" },
        },
      },
      [{ id: "sku-1", name: "Coffee", category: "Grocery" }],
    );

    expect(validateSceneTree(tree).rootNodeId).toBe("store-root");
    expect(tree.nodes["hero-title"].props.text).toBe("EasyMart");
    expect(tree.nodes["hero-cta"].props.label).toBe("Buy now");
    expect(tree.nodes["product-card-sku-1"].name).toBe("Coffee");
  });

  it("restores a saved engine scene before deriving legacy theme nodes", () => {
    const original = buildStoreSceneTree({ business_name: "Saved store" });
    const theme = { ...DEFAULT_THEME, ...createEngineSceneTheme(original) };
    const restored = getSavedEngineScene({ [ENGINE_SCENE_THEME_KEY]: theme[ENGINE_SCENE_THEME_KEY] });
    const built = buildStoreSceneTree({ business_name: "Ignored", theme });

    expect(restored).toEqual(original);
    expect(built).toEqual(original);
  });

  it("serializes the versioned Engine Scene persisted contract", () => {
    const original = buildStoreSceneTree({ business_name: "Engine only" });
    const theme = createEngineSceneTheme(original);

    expect(Object.keys(theme)).toEqual([
      ENGINE_DOCUMENT_VERSION_KEY,
      ENGINE_SCENE_THEME_KEY,
    ]);
    expect(theme[ENGINE_DOCUMENT_VERSION_KEY]).toBe(CURRENT_ENGINE_DOCUMENT_VERSION);
    expect(getRequiredEngineScene(theme)).toEqual(original);
  });
});
