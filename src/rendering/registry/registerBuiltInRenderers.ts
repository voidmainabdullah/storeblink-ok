import type { ElementType } from "@/types";
import type { ElementRenderer } from "./types";
import { ButtonRenderer } from "@/elements/button";
import { ContainerRenderer } from "@/elements/container";
import { ImageRenderer } from "@/elements/image";
import { SectionRenderer } from "@/elements/section";
import { ShapeRenderer } from "@/elements/shape";
import { SvgRenderer } from "@/elements/svg";
import { TextRenderer } from "@/elements/text";
import { VideoRenderer } from "@/elements/video";
import { CustomCodeRenderer } from "@/elements/custom-code";
import { rendererRegistry } from "./RendererRegistry";

const builtInRenderers: Array<[ElementType, ElementRenderer]> = [
  ["text", TextRenderer],
  ["image", ImageRenderer],
  ["button", ButtonRenderer],
  ["container", ContainerRenderer],
  ["section", SectionRenderer],
  ["shape", ShapeRenderer],
  ["svg", SvgRenderer],
  ["video", VideoRenderer],
  ["custom:code", CustomCodeRenderer],
];

export const registerBuiltInRenderers = () =>
  builtInRenderers.map(([type, renderer]) => rendererRegistry.register(type, renderer));

export const ensureBuiltInRenderers = () => {
  builtInRenderers.forEach(([type, renderer]) => {
    if (!rendererRegistry.has(type)) {
      rendererRegistry.register(type, renderer);
    }
  });
};
