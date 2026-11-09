import { describe, expect, it } from "vitest";
import {
  sectionControlSemanticPath,
  semanticPath,
  tokenLiteral,
} from "@/adaptive-commerce/contracts";
import {
  createBuiltInAdaptiveCommerceCatalog,
  createBuiltInStoreDefinition,
} from "@/adaptive-commerce/fixtures";
import type { AdaptiveAuthoringSource } from "./types";
import {
  AdaptiveAuthoringPolicyViolationError,
  createAdaptiveAuthoringSession,
  createBindingSourceCommand,
  createPresetCommand,
  createSemanticValueCommand,
  createTokenCommand,
  executeAdaptiveAuthoringCommand,
  inverseOperationFor,
  projectAdaptiveAuthoringSession,
  redoAdaptiveAuthoringCommand,
  undoAdaptiveAuthoringCommand,
} from "./commands";

const source = (): AdaptiveAuthoringSource => {
  const catalog = createBuiltInAdaptiveCommerceCatalog();
  const storeDefinition = createBuiltInStoreDefinition();
  return {
    kind: "adaptive-storefront-authoring-source",
    storeId: storeDefinition.storeId,
    installationId: storeDefinition.installationId,
    installationStatus: "staged",
    installationRevision: 1,
    sourceRevision: 1,
    sourceHash: `sha256:${"a".repeat(64)}`,
    baseRevisionRowId: "base-row",
    storeDefinition,
    merchantPatches: [],
    catalog: {
      designPack: catalog.designPack,
      componentLibrary: catalog.componentLibrary,
      blueprints: [...catalog.blueprints],
    },
    publishedSourceRevision: null,
    reviewState: "review-needed",
  };
};

describe("adaptive authoring command history", () => {
  it("keeps semantic intent as ordered commands and undo/redo never stores document snapshots", () => {
    const command = createSemanticValueCommand({
      target: "home.hero.heading",
      before: "Thoughtful goods for everyday life",
      after: "Autumn essentials",
      label: "Change hero heading",
    });
    const initial = createAdaptiveAuthoringSession(source());
    const edited = executeAdaptiveAuthoringCommand(initial, command);
    expect(projectAdaptiveAuthoringSession(edited).effectiveDocument.values["home.hero.heading"])
      .toBe("Autumn essentials");
    expect(projectAdaptiveAuthoringSession(edited).operations).toEqual([{
      op: "set",
      target: "home.hero.heading",
      value: "Autumn essentials",
    }]);
    expect(inverseOperationFor(command)).toEqual({
      op: "set",
      target: "home.hero.heading",
      value: "Thoughtful goods for everyday life",
    });

    const undone = undoAdaptiveAuthoringCommand(edited);
    expect(projectAdaptiveAuthoringSession(undone).effectiveDocument.values["home.hero.heading"])
      .toBe("Thoughtful goods for everyday life");
    expect(projectAdaptiveAuthoringSession(undone).operations).toEqual([]);
    expect(projectAdaptiveAuthoringSession(redoAdaptiveAuthoringCommand(undone))
      .effectiveDocument.values["home.hero.heading"]).toBe("Autumn essentials");
    expect(edited.executed[0]).not.toHaveProperty("document");
  });

  it("makes preset, certified token, and commerce selector changes command-backed", () => {
    const initial = source();
    initial.storeDefinition.commerceBindings = [{
      id: "featured-products",
      source: { kind: "collection", selector: "featured" },
      field: "products",
      target: { path: semanticPath("home.featured-products"), property: "items" },
      required: false,
    }];
    let session = createAdaptiveAuthoringSession(initial);
    session = executeAdaptiveAuthoringCommand(session, createPresetCommand("clean-neutral", "atelier"));
    session = executeAdaptiveAuthoringCommand(session, createTokenCommand({
      address: "semantic:type.display",
      before: null,
      after: tokenLiteral("fontFamily", ["Georgia", "serif"]),
      label: "Change display font",
    }));
    session = executeAdaptiveAuthoringCommand(session, createBindingSourceCommand({
      binding: initial.storeDefinition.commerceBindings[0],
      after: { kind: "collection", selector: "recommendations" },
    }));
    const projection = projectAdaptiveAuthoringSession(session);
    expect(projection.storeDefinition.designTokens.presetId).toBe("atelier");
    expect(projection.storeDefinition.designTokens.overrides[0].address)
      .toBe("semantic:type.display");
    expect(projection.storeDefinition.commerceBindings[0].source.selector)
      .toBe("recommendations");
    expect(projection.operations).toEqual([]);
  });

  it("rejects a final-section hide at the command boundary without adding history", () => {
    const initial = source();
    const home = initial.catalog.blueprints.find((blueprint) => blueprint.resourceType === "home")!;
    expect(home.sections.length).toBeGreaterThan(1);
    let session = createAdaptiveAuthoringSession(initial);

    home.sections.slice(0, -1).forEach((section) => {
      const target = sectionControlSemanticPath(section.path, "visible");
      session = executeAdaptiveAuthoringCommand(session, createSemanticValueCommand({
        target,
        before: true,
        after: false,
        label: `Hide ${section.path}`,
      }));
    });

    const finalSection = home.sections.at(-1)!;
    const finalTarget = sectionControlSemanticPath(finalSection.path, "visible");
    const historyLength = session.executed.length;
    const finalHide = createSemanticValueCommand({
      target: finalTarget,
      before: false,
      after: false,
      label: `Hide ${finalSection.path}`,
    });

    expect(() => executeAdaptiveAuthoringCommand(session, finalHide)).toThrowError(
      AdaptiveAuthoringPolicyViolationError,
    );
    try {
      executeAdaptiveAuthoringCommand(session, finalHide);
    } catch (error) {
      expect(error).toMatchObject({
        code: "ADAPTIVE_ROUTE_REQUIRES_VISIBLE_SECTION",
        route: "home",
      });
    }
    expect(session.executed).toHaveLength(historyLength);
    expect(projectAdaptiveAuthoringSession(session).effectiveDocument.values[finalTarget]).toBe(true);
  });
});
