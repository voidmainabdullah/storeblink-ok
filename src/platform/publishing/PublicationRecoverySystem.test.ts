import { describe, expect, it } from "vitest";
import { PublicationRecoverySystem } from "./PublicationRecoverySystem";

describe("PublicationRecoverySystem", () => {
  it("stores immutable tenant-scoped recovery points with bounded retention", () => {
    const recovery = new PublicationRecoverySystem(2);
    const firstDocument = { scene: { title: "One" } };
    const first = recovery.capture({
      storeId: "store-one",
      revision: 1,
      reason: "loaded-publication",
      document: firstDocument,
    });
    firstDocument.scene.title = "Mutated";
    recovery.capture({
      storeId: "store-one",
      revision: 2,
      reason: "pre-publish",
      document: { scene: { title: "Two" } },
    });
    recovery.capture({
      storeId: "store-one",
      revision: 3,
      reason: "manual",
      document: { scene: { title: "Three" } },
    });

    expect(recovery.get("store-one", first.id)).toBeNull();
    const points = recovery.list("store-one");
    expect(points).toHaveLength(2);
    points[0].document = { changed: true };
    expect(recovery.list("store-one")[0].document).not.toEqual({ changed: true });
    expect(recovery.list("store-two")).toEqual([]);
  });
});

