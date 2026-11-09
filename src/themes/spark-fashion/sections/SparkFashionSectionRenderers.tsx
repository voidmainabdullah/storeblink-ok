import { memo, type CSSProperties } from "react";
import { getNodeDomId, getNodeFrameStyle } from "@/rendering/renderer";
import type {
  CanonicalSectionType,
  ThemeSectionRenderer,
  ThemeSectionRendererProps,
} from "@/theme-engine/contracts";

const SparkFashionFrame = memo(({
  node,
  children,
  tokens,
  sectionType,
}: ThemeSectionRendererProps & { sectionType: CanonicalSectionType }) => {
  const variables = {
    "--spark-bg": tokens.colors.background,
    "--spark-surface": tokens.colors.surface,
    "--spark-ink": tokens.colors.text,
    "--spark-muted": tokens.colors.textMuted,
    "--spark-inverse": tokens.colors.surfaceInverse,
    "--spark-border": tokens.colors.border,
    "--spark-accent": tokens.colors.primary,
    "--spark-heading": tokens.typography.headingFont,
    "--spark-body": tokens.typography.bodyFont,
    "--spark-motion": tokens.motion.normal,
    "--spark-ease": tokens.motion.easing,
  } as CSSProperties;

  return (
    <section
      id={getNodeDomId(node)}
      data-node-id={node.id}
      data-node-type={node.type}
      data-theme-id="spark-fashion"
      data-canonical-section={sectionType}
      style={{
        ...getNodeFrameStyle(node),
        ...variables,
        overflow: String(node.props.overflow ?? "visible"),
      }}
    >
      {children}
    </section>
  );
});

SparkFashionFrame.displayName = "SparkFashionFrame";

const sectionRenderer = (sectionType: CanonicalSectionType): ThemeSectionRenderer => {
  const Renderer = memo((props: ThemeSectionRendererProps) => (
    <SparkFashionFrame {...props} sectionType={sectionType} />
  ));
  Renderer.displayName = `SparkFashion${sectionType
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("")}`;
  return Renderer;
};

export const sparkFashionSectionRenderers: Partial<
  Record<CanonicalSectionType, ThemeSectionRenderer>
> = {
  "site-header": sectionRenderer("site-header"),
  "immersive-product-hero": sectionRenderer("immersive-product-hero"),
  "promotional-marquee": sectionRenderer("promotional-marquee"),
  "editorial-intro": sectionRenderer("editorial-intro"),
  "featured-product-collection": sectionRenderer("featured-product-collection"),
  "image-with-text": sectionRenderer("image-with-text"),
  "video-banner": sectionRenderer("video-banner"),
  "customer-stories": sectionRenderer("customer-stories"),
  "site-footer": sectionRenderer("site-footer"),
};
