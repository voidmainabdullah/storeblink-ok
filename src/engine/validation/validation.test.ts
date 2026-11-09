import { describe, expect, it } from "vitest";
import type { Project, SceneNode, SceneTree } from "@/types";
import { DEFAULT_LAYOUT, DEFAULT_STYLE, DEFAULT_TRANSFORM, createNodeMeta } from "@/types";
import { validateImportedData, validateProject, validateSceneNode, validateSceneTree } from "./index";

const validNode: SceneNode = {
  id: "root",
  type: "section",
  name: "Root section",
  parentId: null,
  childIds: [],
  props: {},
  style: DEFAULT_STYLE,
  layout: DEFAULT_LAYOUT,
  transform: DEFAULT_TRANSFORM,
  meta: createNodeMeta(1),
};

const validTree: SceneTree = {
  rootNodeId: "root",
  nodes: {
    root: validNode,
  },
};

const validProject: Project = {
  id: "project-1",
  schemaVersion: 1,
  name: "Storefront",
  pages: [{ id: "page-1", name: "Home", rootNodeId: "root" }],
  assets: [{ id: "asset-1", type: "image", name: "Hero", url: "/hero.png" }],
  preferences: { colorMode: "system" },
  metadata: { createdAt: 1, updatedAt: 1 },
};

describe("validation schemas", () => {
  it("accepts valid scene nodes and rejects invalid nodes", () => {
    expect(validateSceneNode(validNode).id).toBe("root");
    expect(() => validateSceneNode({ ...validNode, type: "unknown" })).toThrow();
  });

  it("accepts valid scene trees and rejects invalid tree structure", () => {
    expect(validateSceneTree(validTree).rootNodeId).toBe("root");
    expect(() =>
      validateSceneTree({
        rootNodeId: "root",
        nodes: {
          root: { ...validNode, childIds: ["missing"] },
        },
      }),
    ).toThrow();
  });

  it("rejects dangling component instance and shared chrome references", () => {
    expect(() =>
      validateSceneTree({
        ...validTree,
        nodes: {
          root: {
            ...validNode,
            meta: {
              ...validNode.meta,
              componentId: "missing-component",
              componentInstance: {
                componentDefinitionId: "missing-component",
                variantId: "default",
                overrides: [],
                detached: false,
              },
            },
          },
        },
      }),
    ).toThrow(/missing definition/i);

    expect(() =>
      validateSceneTree({
        ...validTree,
        components: {
          version: 1,
          definitions: {},
          sharedChrome: { headerDefinitionId: "missing-header" },
        },
      }),
    ).toThrow(/shared chrome references missing component/i);
  });

  it("accepts valid projects and rejects invalid projects", () => {
    expect(validateProject(validProject).schemaVersion).toBe(1);
    expect(() => validateProject({ ...validProject, schemaVersion: 0 })).toThrow();
  });

  it("validates imported data at the ingestion boundary", () => {
    expect(validateImportedData(validProject)).toEqual(validProject);
    expect(() => validateImportedData({ id: "" })).toThrow();
  });

  it("normalizes legacy SVG markup into the typed safe model", () => {
    const result = validateSceneNode({
      ...validNode,
      type: "svg",
      props: {
        markup: `
          <svg viewBox="0 0 40 20" onload="alert(1)">
            <script>alert(1)</script>
            <foreignObject><iframe src="https://evil.test" /></foreignObject>
            <a href="javascript:alert(1)"><path d="M0 0h40v20H0z" /></a>
            <path d="M0 0h40v20H0z" onclick="alert(1)" fill="url(https://evil.test/a.svg#x)" />
          </svg>
        `,
      },
    });

    expect(result.props).not.toHaveProperty("markup");
    expect(result.props.svg).toMatchObject({
      version: 1,
      width: 40,
      height: 20,
      aspectRatio: 2,
    });
    const markup = String((result.props.svg as { markup: string }).markup);
    expect(markup).not.toMatch(
      /script|foreignObject|iframe|javascript:|evil\.test|onload|onclick/i,
    );
    expect(markup).toContain("<path");
  });

  it("rejects malformed and oversized SVG documents at scene ingestion", () => {
    expect(() =>
      validateSceneNode({
        ...validNode,
        type: "svg",
        props: { markup: "<svg><path></svg>" },
      }),
    ).toThrow(/valid XML/i);
    expect(() =>
      validateSceneNode({
        ...validNode,
        type: "svg",
        props: { markup: `<svg><path d="${"x".repeat(2 * 1024 * 1024)}" /></svg>` },
      }),
    ).toThrow(/2 MB safety limit/i);
  });
});
