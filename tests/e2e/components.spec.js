import { expect, test } from "@playwright/test";

test("component definitions and physical instances execute in the browser runtime", async ({ page }) => {
  await page.goto("/");

  const result = await page.evaluate(async () => {
    const loadModule = new Function("path", "return import(path)");
    const [{ createComponentSystem }, { createSceneNode }, { validateSceneTree }] = await Promise.all([
      loadModule("/src/document/components/ComponentSystem.ts"),
      loadModule("/src/engine/scene-graph/nodeFactory.ts"),
      loadModule("/src/engine/validation/index.ts"),
    ]);
    const root = createSceneNode({ id: "root", type: "section", name: "Page" }, null);
    const card = createSceneNode({ id: "card", type: "container", name: "Card" }, root.id);
    const title = createSceneNode({
      id: "title",
      type: "text",
      name: "Title",
      props: { text: "Master title" },
    }, card.id);
    root.childIds = [card.id];
    card.childIds = [title.id];
    const components = createComponentSystem();
    let scene = validateSceneTree({
      rootNodeId: root.id,
      nodes: { [root.id]: root, [card.id]: card, [title.id]: title },
    });
    scene = components.createDefinition(scene, card.id, {
      definitionId: "browser-card",
    }).scene;
    const instantiated = components.instantiate(scene, "browser-card", root.id, {
      x: 320,
      y: 80,
    });
    const instanceRootId = instantiated.instanceRootId;
    scene = components.applyOverride(instantiated.scene, instanceRootId, {
      sourceNodeId: title.id,
      scope: "text",
      patch: { props: { text: "Browser override" } },
    });
    scene.nodes[title.id].props.text = "Updated master";
    scene = components.updateDefinition(scene, "browser-card").scene;
    const instanceTitle = Object.values(scene.nodes).find((node) =>
      node.extensions?.componentInstanceId === instanceRootId &&
      node.extensions?.componentSourceNodeId === title.id,
    );
    const detached = components.detach(scene, instanceRootId);
    components.assertScene(detached);

    return {
      instanceText: instanceTitle?.props.text,
      placement: scene.nodes[instanceRootId].transform,
      detached: !detached.nodes[instanceRootId].meta.componentInstance,
    };
  });

  expect(result.instanceText).toBe("Browser override");
  expect(result.placement).toMatchObject({ x: 320, y: 80 });
  expect(result.detached).toBe(true);
});
