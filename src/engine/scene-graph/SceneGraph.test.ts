import { describe, expect, it } from "vitest";
import { createEngineEventBus } from "@/engine/event-bus";
import { createSceneGraph } from "./SceneGraph";

describe("SceneGraph", () => {
  it("creates, updates, moves, clones, traverses, and deletes nodes", () => {
    const eventBus = createEngineEventBus();
    const events: string[] = [];
    eventBus.on("scene:node:created", ({ node }) => events.push(`created:${node.id}`));
    eventBus.on("scene:node:updated", ({ nodeId }) => events.push(`updated:${nodeId}`));
    eventBus.on("scene:node:moved", ({ nodeId }) => events.push(`moved:${nodeId}`));
    eventBus.on("scene:node:deleted", ({ nodeId }) => events.push(`deleted:${nodeId}`));

    const graph = createSceneGraph({ eventBus });
    graph.createNode({ id: "root", type: "section", name: "Home" });
    graph.createNode({ id: "group", type: "container", name: "Group" }, "root");
    graph.createNode({ id: "headline", type: "text", name: "Headline", props: { text: "Hello" } }, "group");
    graph.createNode({ id: "photo", type: "image", name: "Photo", props: { src: "/photo.png" } }, "group");

    expect(graph.findNode("headline")?.props.text).toBe("Hello");
    expect(graph.getParent("headline")?.id).toBe("group");
    expect(graph.getChildren("group").map((node) => node.id)).toEqual(["headline", "photo"]);
    expect(graph.getDescendants("root").map((node) => node.id)).toEqual(["group", "headline", "photo"]);

    const updated = graph.updateNode("headline", { props: { text: "Welcome" }, transform: { x: 24 } });
    expect(updated.props.text).toBe("Welcome");
    expect(updated.transform.x).toBe(24);

    graph.moveNode("headline", "root", 0);
    expect(graph.getAncestors("headline").map((node) => node.id)).toEqual(["root"]);
    expect(graph.getChildren("root").map((node) => node.id)).toEqual(["headline", "group"]);

    const clone = graph.cloneNode("group", {
      idFactory: (source) => `${source.id}-copy`,
    });
    expect(clone.id).toBe("group-copy");
    expect(graph.findNode("photo-copy")?.parentId).toBe("group-copy");

    const visited: string[] = [];
    graph.traverse((node) => visited.push(node.id));
    expect(visited).toEqual(["root", "headline", "group", "photo", "group-copy", "photo-copy"]);

    const deleted = graph.deleteNode("group");
    expect(deleted.map((node) => node.id)).toEqual(["group", "photo"]);
    expect(graph.findNode("photo")).toBeUndefined();
    expect(graph.validateTree()).toEqual({ valid: true, errors: [] });
    expect(events).toContain("created:root");
    expect(events).toContain("updated:headline");
    expect(events).toContain("moved:headline");
    expect(events).toContain("deleted:group");
  });
});
