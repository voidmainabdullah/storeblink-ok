import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createSceneNode } from "@/engine/scene-graph";
import { SvgRenderer } from "./SvgRenderer";

describe("SvgRenderer security boundary", () => {
  it("never inserts executable persisted SVG content into the DOM", () => {
    const node = createSceneNode(
      {
        id: "unsafe-svg",
        type: "svg",
        name: "Imported icon",
        props: {
          markup: `
            <svg viewBox="0 0 24 24" onload="alert(1)">
              <script>alert(1)</script>
              <foreignObject><iframe src="https://evil.test" /></foreignObject>
              <a href="javascript:alert(1)"><circle cx="4" cy="4" r="2" /></a>
              <path d="M2 12h20" onclick="alert(1)" stroke="currentColor" />
            </svg>
          `,
        },
      },
      null,
    );

    const { container } = render(<SvgRenderer node={node} />);
    const html = container.innerHTML;

    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("path")).not.toBeNull();
    expect(container.querySelector("script, foreignObject, iframe, a")).toBeNull();
    expect(html).not.toMatch(/onload|onclick|javascript:|evil\.test/i);
  });

  it("does not fetch an untrusted external SVG source", () => {
    const node = createSceneNode(
      {
        id: "remote-svg",
        type: "svg",
        name: "Remote icon",
        props: { src: "https://evil.test/tracker.svg" },
      },
      null,
    );

    const { container } = render(<SvgRenderer node={node} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-invalid-svg='true']")).not.toBeNull();
  });
});
