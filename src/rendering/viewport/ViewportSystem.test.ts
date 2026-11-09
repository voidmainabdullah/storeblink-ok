import { beforeEach, describe, expect, it } from "vitest";
import { useViewportStore } from "@/stores/viewport.store";
import { ViewportSystem } from "./ViewportSystem";

describe("ViewportSystem", () => {
  beforeEach(() => {
    useViewportStore.setState({
      zoom: 1,
      pan: { x: 0, y: 0 },
      viewportSize: { width: 1000, height: 700 },
      minZoom: 0.1,
      maxZoom: 4,
    });
  });

  it("fits page width without shrinking to the full document height", () => {
    const viewport = new ViewportSystem({
      contentBoundsResolver: () => ({ x: 0, y: 0, width: 1200, height: 3200 }),
    });

    viewport.fitToWidth(undefined, 20);

    const snapshot = viewport.getSnapshot();
    expect(snapshot.zoom).toBeCloseTo(0.8);
    expect(snapshot.pan.x).toBeCloseTo(20);
    expect(snapshot.pan.y).toBeCloseTo(20);
  });

  it("preserves the document point under the cursor across repeated zoom changes", () => {
    const viewport = new ViewportSystem();
    const cursor = { x: 347, y: 219 };
    viewport.panTo({ x: 63, y: -41 });
    const anchoredPoint = viewport.screenToDocument(cursor);

    [1.25, 2.5, 0.4, 4, 0.1, 1.75, 1].forEach((zoom) => {
      viewport.zoomTo(zoom, cursor);
      expect(viewport.screenToDocument(cursor).x).toBeCloseTo(anchoredPoint.x, 8);
      expect(viewport.screenToDocument(cursor).y).toBeCloseTo(anchoredPoint.y, 8);
    });
  });

  it("rejects non-finite camera input without corrupting the viewport", () => {
    const viewport = new ViewportSystem();
    const before = viewport.getSnapshot();

    viewport.zoomTo(Number.NaN, { x: 50, y: 50 });
    viewport.panTo({ x: Number.POSITIVE_INFINITY, y: 0 });
    viewport.panBy({ x: 0, y: Number.NaN });
    viewport.setViewportSize({ width: Number.NaN, height: 600 });

    expect(viewport.getSnapshot()).toEqual(before);
  });
});
