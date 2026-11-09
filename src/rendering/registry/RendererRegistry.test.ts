import { createElement, isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, DEFAULT_STYLE, DEFAULT_TRANSFORM, type SceneNode } from "@/types";
import { FallbackRenderer } from "./FallbackRenderer";
import { RendererRegistry } from "./RendererRegistry";
import type { ElementRendererProps } from "./types";

const TestRenderer = ({ node }: ElementRendererProps) => createElement("div", null, node.name);

const node: SceneNode = {
  id: "text-1",
  type: "text",
  name: "Headline",
  parentId: null,
  childIds: [],
  props: {},
  style: DEFAULT_STYLE,
  layout: DEFAULT_LAYOUT,
  transform: DEFAULT_TRANSFORM,
  meta: { locked: false, hidden: false, createdAt: 1, updatedAt: 1 },
};

describe("renderer registry", () => {
  it("registers, resolves, renders, and unregisters element renderers", () => {
    const registry = new RendererRegistry();

    expect(registry.get("text")).toBe(FallbackRenderer);

    const unregister = registry.register("text", TestRenderer);
    expect(registry.has("text")).toBe(true);
    expect(registry.get("text")).toBe(TestRenderer);

    const rendered = registry.renderNode(node);
    expect(isValidElement(rendered)).toBe(true);
    if (isValidElement(rendered)) {
      expect(rendered.type).toBe(TestRenderer);
    }

    unregister();
    expect(registry.has("text")).toBe(false);
    expect(registry.get("text")).toBe(FallbackRenderer);
  });
});
