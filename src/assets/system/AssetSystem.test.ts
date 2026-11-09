import { describe, expect, it } from "vitest";
import { createSceneNode } from "@/engine/scene-graph";
import { AssetSystem, sanitizeSvg, svgDataUrl } from "./index";

describe("AssetSystem", () => {
  it("removes executable SVG content through the shared sanitizer", () => {
    const result = sanitizeSvg(`
      <svg viewBox="0 0 120 40" onload="alert(1)" xmlns="http://www.w3.org/2000/svg">
        <script>alert(1)</script>
        <foreignObject><iframe src="javascript:alert(1)"/></foreignObject>
        <path d="M0 0h120v40H0z" onclick="alert(1)" fill="url(https://evil.test/a.svg#x)"/>
      </svg>
    `);

    expect(result).toMatchObject({ width: 120, height: 40, aspectRatio: 3 });
    expect(result.markup).not.toMatch(/script|foreignObject|iframe|onload|onclick|evil\.test/i);
  });

  it("persists validated image metadata on the Scene Graph root", () => {
    const root = createSceneNode(
      { id: "root", type: "container", name: "Root" },
      null,
    );
    const scene = { rootNodeId: root.id, nodes: { [root.id]: root } };
    const system = new AssetSystem();
    const asset = {
      id: "asset-logo",
      kind: "image" as const,
      originalSource: "data:image/png;base64,AA==",
      originalName: "logo.png",
      intrinsicWidth: 400,
      intrinsicHeight: 100,
      aspectRatio: 4,
      format: "png" as const,
      altText: "Store logo",
      createdAt: 1,
      updatedAt: 1,
    };

    const next = system.upsertImage(scene, asset);

    expect(system.getImage(next, asset.id)).toEqual(asset);
    expect(scene.nodes.root.extensions?.assetLibrary).toBeUndefined();
  });

  it("persists new assets as durable references without inline binary data", () => {
    const root = createSceneNode({ id: "root", type: "container", name: "Root" }, null);
    const scene = { rootNodeId: root.id, nodes: { [root.id]: root } };
    const next = new AssetSystem().upsertImage(scene, {
      id: "asset-durable",
      kind: "image",
      originalName: "photo.webp",
      intrinsicWidth: 960,
      intrinsicHeight: 640,
      aspectRatio: 1.5,
      format: "webp",
      mimeType: "image/webp",
      bytes: 24000,
      contentHash: "a".repeat(64),
      altText: "Product photo",
      storage: {
        bucket: "storefront-assets",
        path: "stores/store/assets/asset-durable/hash-photo.webp",
        publicUrl: "https://cdn.example/photo.webp",
      },
      createdAt: 1,
      updatedAt: 1,
    });

    expect(JSON.stringify(next)).not.toMatch(/data:image|base64/i);
    expect(new AssetSystem().getImage(next, "asset-durable")?.storage?.path).toContain("asset-durable");
  });

  it("re-sanitizes persisted SVG assets before returning them to renderers", () => {
    const root = createSceneNode(
      { id: "root", type: "container", name: "Root" },
      null,
    );
    const unsafeMarkup = `
      <svg viewBox="0 0 20 10" onload="alert(1)">
        <script>alert(1)</script>
        <path d="M0 0h20v10H0z" fill="url(https://evil.test/a.svg#x)" />
      </svg>
    `;
    root.extensions = {
      assetLibrary: {
        version: 1,
        items: {
          logo: {
            id: "logo",
            kind: "image",
            originalSource: svgDataUrl(unsafeMarkup),
            originalName: "logo.svg",
            intrinsicWidth: 1,
            intrinsicHeight: 1,
            aspectRatio: 1,
            format: "svg",
            altText: "Logo",
            createdAt: 1,
            updatedAt: 1,
          },
        },
      },
    };
    const scene = { rootNodeId: root.id, nodes: { [root.id]: root } };

    const asset = new AssetSystem().getImage(scene, "logo");

    expect(asset).toMatchObject({
      intrinsicWidth: 20,
      intrinsicHeight: 10,
      aspectRatio: 2,
    });
    expect(decodeURIComponent(asset!.originalSource)).not.toMatch(
      /script|onload|evil\.test/i,
    );
  });
});
