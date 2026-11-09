import { z } from "zod";
import type { SceneNode, SceneTree } from "@/types";

const SAFE_SVG_VERSION = 1 as const;
const MAX_SVG_BYTES = 2 * 1024 * 1024;
const MAX_SVG_ELEMENTS = 5_000;
const MAX_ATTRIBUTES_PER_ELEMENT = 48;
const MAX_ATTRIBUTE_LENGTH = 200_000;
const MAX_DIMENSION = 100_000;
const CACHE_LIMIT = 256;

const safeSvgMarkupBrand: unique symbol = Symbol("SafeSvgMarkup");

export type SafeSvgMarkup = string & {
  readonly [safeSvgMarkupBrand]: true;
};

export type SafeSvgModel = {
  version: typeof SAFE_SVG_VERSION;
  markup: SafeSvgMarkup;
  width: number;
  height: number;
  aspectRatio: number;
};

export class SvgSecurityError extends Error {
  readonly code = "invalid-svg";

  constructor(message: string) {
    super(message);
    this.name = "SvgSecurityError";
  }
}

const allowedElements = new Set([
  "svg",
  "g",
  "defs",
  "symbol",
  "use",
  "title",
  "desc",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "clippath",
  "mask",
  "lineargradient",
  "radialgradient",
  "stop",
  "pattern",
  "filter",
  "fegaussianblur",
  "feoffset",
  "feflood",
  "fecomposite",
  "feblend",
  "fecolormatrix",
  "femerge",
  "femergenode",
]);

const allowedAttributes = new Set([
  "id",
  "xmlns",
  "xmlns:xlink",
  "viewbox",
  "preserveaspectratio",
  "role",
  "aria-label",
  "aria-hidden",
  "focusable",
  "d",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "points",
  "pathlength",
  "fill",
  "fill-rule",
  "fill-opacity",
  "clip-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-opacity",
  "opacity",
  "transform",
  "vector-effect",
  "clip-path",
  "mask",
  "filter",
  "href",
  "xlink:href",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientunits",
  "gradienttransform",
  "spreadmethod",
  "fx",
  "fy",
  "fr",
  "patternunits",
  "patterncontentunits",
  "patterntransform",
  "filterunits",
  "primitiveunits",
  "in",
  "in2",
  "result",
  "stddeviation",
  "dx",
  "dy",
  "flood-color",
  "flood-opacity",
  "operator",
  "k1",
  "k2",
  "k3",
  "k4",
  "mode",
  "type",
  "values",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
]);

const localReferenceAttributes = new Set([
  "href",
  "xlink:href",
  "clip-path",
  "mask",
  "filter",
]);

const paintAttributes = new Set(["fill", "stroke"]);
const cache = new Map<string, SafeSvgModel>();

const cloneModel = (model: SafeSvgModel): SafeSvgModel => ({ ...model });

const sourceBytes = (source: string): number =>
  typeof TextEncoder === "undefined"
    ? source.length * 2
    : new TextEncoder().encode(source).byteLength;

const compactForProtocolCheck = (value: string): string =>
  [...value]
    .filter((character) => character.charCodeAt(0) > 32)
    .join("")
    .toLowerCase();

const containsUnsafeProtocol = (value: string): boolean => {
  const compact = compactForProtocolCheck(value);
  return (
    compact.includes("javascript:") ||
    compact.includes("vbscript:") ||
    compact.includes("data:") ||
    compact.includes("http:") ||
    compact.includes("https:") ||
    compact.includes("//") ||
    compact.includes("@import") ||
    compact.includes("expression(")
  );
};

const isFragmentReference = (value: string): boolean =>
  /^#[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value.trim());

const isLocalUrlReference = (value: string): boolean =>
  /^url\(\s*#[A-Za-z_][A-Za-z0-9_.:-]*\s*\)$/i.test(value.trim());

const isSafeAttributeValue = (name: string, value: string): boolean => {
  if (value.length > MAX_ATTRIBUTE_LENGTH || containsUnsafeProtocol(value)) return false;
  if (name === "xmlns") return value === "http://www.w3.org/2000/svg";
  if (name === "xmlns:xlink") return value === "http://www.w3.org/1999/xlink";
  if (name === "id") return /^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value);
  if (name === "href" || name === "xlink:href") return isFragmentReference(value);
  if (localReferenceAttributes.has(name)) {
    return value.trim().toLowerCase() === "none" || isLocalUrlReference(value);
  }
  if (paintAttributes.has(name) && /url\(/i.test(value)) return isLocalUrlReference(value);
  return true;
};

const finiteDimension = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_DIMENSION
    ? parsed
    : null;
};

const cacheModel = (source: string, model: SafeSvgModel): void => {
  if (cache.has(source)) cache.delete(source);
  cache.set(source, cloneModel(model));
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
};

const sanitizeElement = (element: Element): void => {
  if (element.attributes.length > MAX_ATTRIBUTES_PER_ELEMENT) {
    throw new SvgSecurityError("The SVG contains an element with too many attributes.");
  }
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    if (
      name.startsWith("on") ||
      name === "style" ||
      !allowedAttributes.has(name) ||
      !isSafeAttributeValue(name, attribute.value)
    ) {
      element.removeAttribute(attribute.name);
    }
  }
};

export const safeSvgModelSchema = z.object({
  version: z.literal(SAFE_SVG_VERSION),
  markup: z.string().min(1),
  width: z.number().finite().positive().max(MAX_DIMENSION),
  height: z.number().finite().positive().max(MAX_DIMENSION),
  aspectRatio: z.number().finite().positive(),
});

export const sanitizeSvgMarkup = (source: string): SafeSvgModel => {
  if (!source.trim()) throw new SvgSecurityError("SVG markup is empty.");
  if (sourceBytes(source) > MAX_SVG_BYTES) {
    throw new SvgSecurityError("SVG markup exceeds the 2 MB safety limit.");
  }
  const cached = cache.get(source);
  if (cached) {
    cache.delete(source);
    cache.set(source, cached);
    return cloneModel(cached);
  }
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    throw new SvgSecurityError("SVG processing is unavailable in this environment.");
  }
  if (/<!doctype|<!entity/i.test(source)) {
    throw new SvgSecurityError("SVG document types and entities are not supported.");
  }

  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  if (document.querySelector("parsererror")) {
    throw new SvgSecurityError("The SVG is not valid XML.");
  }
  const root = document.documentElement;
  if (root.localName.toLowerCase() !== "svg") {
    throw new SvgSecurityError("The document does not contain an SVG root.");
  }

  const descendants = [...root.querySelectorAll("*")];
  if (descendants.length + 1 > MAX_SVG_ELEMENTS) {
    throw new SvgSecurityError("The SVG contains too many elements.");
  }
  for (const element of descendants) {
    if (!allowedElements.has(element.localName.toLowerCase())) element.remove();
  }
  for (const element of [root, ...root.querySelectorAll("*")]) {
    sanitizeElement(element);
  }

  const viewBoxValues = (root.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const validViewBox =
    viewBoxValues.length === 4 &&
    viewBoxValues.every(Number.isFinite) &&
    viewBoxValues[2] > 0 &&
    viewBoxValues[3] > 0 &&
    viewBoxValues[2] <= MAX_DIMENSION &&
    viewBoxValues[3] <= MAX_DIMENSION;
  const width =
    finiteDimension(root.getAttribute("width")) ??
    (validViewBox ? viewBoxValues[2] : null) ??
    512;
  const height =
    finiteDimension(root.getAttribute("height")) ??
    (validViewBox ? viewBoxValues[3] : null) ??
    512;

  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  root.setAttribute(
    "viewBox",
    validViewBox ? viewBoxValues.join(" ") : `0 0 ${width} ${height}`,
  );
  root.removeAttribute("width");
  root.removeAttribute("height");

  const markup = new XMLSerializer().serializeToString(root);
  if (
    /<script|<foreignObject|\son[a-z]+\s*=|javascript:|vbscript:|data:text|data:application/i.test(
      markup,
    )
  ) {
    throw new SvgSecurityError("The SVG contains unsafe executable content.");
  }

  const model: SafeSvgModel = {
    version: SAFE_SVG_VERSION,
    markup: markup as SafeSvgMarkup,
    width,
    height,
    aspectRatio: width / height,
  };
  cacheModel(source, model);
  cacheModel(markup, model);
  return cloneModel(model);
};

const candidateMarkup = (props: Record<string, unknown>): string | null => {
  const storedModel = safeSvgModelSchema.safeParse(props.svg);
  if (storedModel.success) return storedModel.data.markup;
  return typeof props.markup === "string" ? props.markup : null;
};

export const resolveSafeSvgModel = (
  props: Record<string, unknown>,
): SafeSvgModel | null => {
  const markup = candidateMarkup(props);
  return markup ? sanitizeSvgMarkup(markup) : null;
};

export const normalizeSvgNode = (node: SceneNode): SceneNode => {
  if (node.type !== "svg") return node;
  const markup = candidateMarkup(node.props);
  if (!markup) return node;
  const svg = sanitizeSvgMarkup(markup);
  const current = safeSvgModelSchema.safeParse(node.props.svg);
  const { markup: _legacyMarkup, ...remainingProps } = node.props;
  if (
    current.success &&
    !Object.prototype.hasOwnProperty.call(node.props, "markup") &&
    current.data.markup === svg.markup &&
    current.data.width === svg.width &&
    current.data.height === svg.height &&
    current.data.aspectRatio === svg.aspectRatio
  ) {
    return node;
  }
  return {
    ...node,
    props: {
      ...remainingProps,
      svg,
    },
  };
};

export const normalizeSceneSvgContent = (tree: SceneTree): SceneTree => {
  let changed = false;
  const nodes = Object.fromEntries(
    Object.entries(tree.nodes).map(([id, node]) => {
      const normalized = normalizeSvgNode(node);
      if (normalized !== node) changed = true;
      return [id, normalized];
    }),
  );
  return changed ? { ...tree, nodes } : tree;
};

export const svgDataUrl = (markup: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;

const decodeBase64Utf8 = (value: string): string => {
  if (typeof atob !== "function" || typeof TextDecoder === "undefined") {
    throw new SvgSecurityError("Base64 SVG decoding is unavailable.");
  }
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export const decodeSvgDataUrl = (source: string): string => {
  const match = /^data:image\/svg\+xml(?:;charset=[^;,]+)?(;base64)?,(.*)$/is.exec(
    source.trim(),
  );
  if (!match) throw new SvgSecurityError("Only inline SVG data URLs are supported.");
  try {
    return match[1] ? decodeBase64Utf8(match[2]) : decodeURIComponent(match[2]);
  } catch (error) {
    if (error instanceof SvgSecurityError) throw error;
    throw new SvgSecurityError("The SVG data URL is malformed.");
  }
};

export const sanitizeSvgDataUrl = (source: string): SafeSvgModel =>
  sanitizeSvgMarkup(decodeSvgDataUrl(source));

