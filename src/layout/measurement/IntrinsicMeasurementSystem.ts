import type { ElementType, SceneNode, Size } from "@/types";
import type {
  IntrinsicMeasureContext,
  IntrinsicMeasurementProvider,
  IntrinsicMeasurementSystemAPI,
  TextMeasurementProvider,
  TextMeasurementRequest,
} from "./types";

const CACHE_LIMIT = 2_000;
const DEFAULT_FONT_SIZE = 16;

const finitePositive = (value: unknown, fallback: number): number => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const textForNode = (node: SceneNode): string =>
  String(node.props.text ?? node.props.content ?? node.props.label ?? "");

const deterministicTextWidth: TextMeasurementProvider = ({
  text,
  fontSize,
  fontWeight,
  letterSpacing,
}) => {
  const weight = Number(fontWeight);
  const weightFactor = Number.isFinite(weight) && weight >= 600 ? 1.035 : 1;
  const glyphUnits = [...text].reduce((total, character) => {
    if (/\s/.test(character)) return total + 0.32;
    if (/[ilI1|.,'`]/.test(character)) return total + 0.29;
    if (/[MW@#%&]/.test(character)) return total + 0.88;
    return total + 0.56;
  }, 0);
  return Math.max(0, glyphUnits * fontSize * weightFactor + Math.max(0, text.length - 1) * letterSpacing);
};

const createCanvasTextMeasurementProvider = (): TextMeasurementProvider | null => {
  if (typeof OffscreenCanvas === "undefined") return null;
  const context = new OffscreenCanvas(1, 1).getContext("2d");
  if (!context) return null;
  return ({ text, fontFamily, fontSize, fontWeight, letterSpacing }) => {
    context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    return context.measureText(text).width + Math.max(0, text.length - 1) * letterSpacing;
  };
};

const resolveLineHeight = (node: SceneNode, fontSize: number): number => {
  const lineHeight = node.props.lineHeight;
  if (lineHeight === "normal" || lineHeight === undefined) return fontSize * 1.2;
  const numeric = Number(lineHeight);
  if (!Number.isFinite(numeric) || numeric <= 0) return fontSize * 1.2;
  return numeric <= 4 ? numeric * fontSize : numeric;
};

const bounded = (value: number, min = 1, max = Number.POSITIVE_INFINITY) =>
  Math.min(max, Math.max(min, value));

const cacheKey = (node: SceneNode, context: IntrinsicMeasureContext): string => {
  const content = textForNode(node);
  return [
    node.id,
    node.type,
    node.meta.updatedAt,
    node.transform.width,
    node.transform.height,
    context.availableWidth ?? "auto",
    context.availableHeight ?? "auto",
    content,
    node.props.fontFamily ?? "",
    node.props.fontSize ?? "",
    node.props.fontWeight ?? "",
    node.props.lineHeight ?? "",
    node.props.letterSpacing ?? "",
    node.props.intrinsicWidth ?? "",
    node.props.intrinsicHeight ?? "",
  ].join(":");
};

export class IntrinsicMeasurementSystem implements IntrinsicMeasurementSystemAPI {
  private readonly providers = new Map<ElementType | "custom:*", IntrinsicMeasurementProvider>();
  private readonly cache = new Map<string, Size>();
  private readonly textMeasurement: TextMeasurementProvider;

  constructor(options: { textMeasurement?: TextMeasurementProvider } = {}) {
    this.textMeasurement =
      options.textMeasurement ?? createCanvasTextMeasurementProvider() ?? deterministicTextWidth;
  }

  register(type: ElementType | "custom:*", provider: IntrinsicMeasurementProvider): () => void {
    this.providers.set(type, provider);
    this.invalidate();
    return () => {
      if (this.providers.get(type) === provider) this.providers.delete(type);
      this.invalidate();
    };
  }

  measure(node: SceneNode, context: IntrinsicMeasureContext = {}): Size {
    const key = cacheKey(node, context);
    const cached = this.cache.get(key);
    if (cached) return { ...cached };

    const provider =
      this.providers.get(node.type) ??
      (node.type.startsWith("custom:") ? this.providers.get("custom:*") : undefined);
    const measured = provider ? provider(node, context) : this.measureBuiltIn(node, context);
    const result = {
      width: bounded(Number.isFinite(measured.width) ? measured.width : node.transform.width),
      height: bounded(Number.isFinite(measured.height) ? measured.height : node.transform.height),
    };
    this.cache.set(key, result);
    if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value as string);
    return { ...result };
  }

  invalidate(nodeId?: string): void {
    if (!nodeId) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${nodeId}:`)) this.cache.delete(key);
    }
  }

  private measureBuiltIn(node: SceneNode, context: IntrinsicMeasureContext): Size {
    if (node.type === "text") return this.measureText(node, context);
    if (node.type === "button") return this.measureButton(node, context);
    if (node.type === "image" || node.type === "video") return this.measureMedia(node);
    if ((node.type === "container" || node.type === "section" || node.type.startsWith("custom:")) && context.scene) {
      const children = node.childIds
        .map((id) => context.scene?.nodes[id])
        .filter((child): child is SceneNode => Boolean(child && !child.meta.hidden));
      if (children.length) {
        return {
          width: Math.max(1, ...children.map((child) => child.transform.x + child.transform.width)),
          height: Math.max(1, ...children.map((child) => child.transform.y + child.transform.height)),
        };
      }
    }
    return { width: node.transform.width, height: node.transform.height };
  }

  private measureText(node: SceneNode, context: IntrinsicMeasureContext): Size {
    const text = textForNode(node);
    const fontSize = finitePositive(node.props.fontSize, DEFAULT_FONT_SIZE);
    const fontFamily = String(node.props.fontFamily ?? "Inter, system-ui, sans-serif");
    const fontWeight = (node.props.fontWeight as string | number | undefined) ?? 400;
    const letterSpacing = Number.isFinite(Number(node.props.letterSpacing))
      ? Number(node.props.letterSpacing)
      : 0;
    const measure = (value: string) => this.textMeasurement({
      text: value,
      fontFamily,
      fontSize,
      fontWeight,
      letterSpacing,
    });
    const maximumWidth = finitePositive(context.availableWidth, Number.POSITIVE_INFINITY);
    let widestLine = 0;
    let lineCount = 0;

    for (const paragraph of text.split("\n")) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) {
        lineCount += 1;
        continue;
      }
      let currentWidth = 0;
      const spaceWidth = measure(" ");
      words.forEach((word) => {
        const wordWidth = measure(word);
        const proposed = currentWidth ? currentWidth + spaceWidth + wordWidth : wordWidth;
        if (currentWidth && proposed > maximumWidth) {
          widestLine = Math.max(widestLine, currentWidth);
          lineCount += 1;
          currentWidth = Math.min(wordWidth, maximumWidth);
        } else {
          currentWidth = Math.min(proposed, maximumWidth);
        }
      });
      widestLine = Math.max(widestLine, currentWidth);
      lineCount += 1;
    }

    return {
      width: Math.max(1, Math.min(maximumWidth, widestLine || measure(text))),
      height: Math.max(resolveLineHeight(node, fontSize), lineCount * resolveLineHeight(node, fontSize)),
    };
  }

  private measureButton(node: SceneNode, context: IntrinsicMeasureContext): Size {
    const textNode: SceneNode = {
      ...node,
      type: "text",
      props: { ...node.props, text: textForNode(node) },
    };
    const paddingX = finitePositive(node.props.paddingX, 20);
    const paddingY = finitePositive(node.props.paddingY, 12);
    const measured = this.measureText(textNode, {
      ...context,
      availableWidth:
        context.availableWidth === undefined
          ? undefined
          : Math.max(1, context.availableWidth - paddingX * 2),
    });
    return { width: measured.width + paddingX * 2, height: measured.height + paddingY * 2 };
  }

  private measureMedia(node: SceneNode): Size {
    const width = finitePositive(
      node.props.intrinsicWidth ?? node.props.naturalWidth,
      node.transform.width,
    );
    const height = finitePositive(
      node.props.intrinsicHeight ?? node.props.naturalHeight,
      node.transform.height,
    );
    return { width, height };
  }
}

export const createIntrinsicMeasurementSystem = (
  options: ConstructorParameters<typeof IntrinsicMeasurementSystem>[0] = {},
) => new IntrinsicMeasurementSystem(options);

export const intrinsicMeasurementSystem = createIntrinsicMeasurementSystem();
