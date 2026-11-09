import { memo, type CSSProperties } from "react";
import { getNodeDomId, getNodeFrameStyle } from "@/rendering/renderer";
import type {
  CanonicalSectionType,
  ThemeSectionRenderer,
  ThemeSectionRendererProps,
} from "@/theme-engine/contracts";

const AtelierFrame = memo(({
  node,
  children,
  tokens,
  sectionType,
}: ThemeSectionRendererProps & { sectionType: CanonicalSectionType }) => {
  const variables = {
    "--atelier-bg": tokens.colors.background,
    "--atelier-surface": tokens.colors.surface,
    "--atelier-ink": tokens.colors.text,
    "--atelier-muted": tokens.colors.textMuted,
    "--atelier-inverse": tokens.colors.surfaceInverse,
    "--atelier-border": tokens.colors.border,
    "--atelier-accent": tokens.colors.primary,
    "--atelier-heading": tokens.typography.headingFont,
    "--atelier-body": tokens.typography.bodyFont,
    "--atelier-serif": tokens.typography.editorialFont,
    "--atelier-motion": tokens.motion.normal,
    "--atelier-ease": tokens.motion.easing,
  } as CSSProperties;

  return (
    <section
      id={getNodeDomId(node)}
      data-node-id={node.id}
      data-node-type={node.type}
      data-theme-id="atelier"
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

AtelierFrame.displayName = "AtelierFrame";

const sectionRenderer = (sectionType: CanonicalSectionType): ThemeSectionRenderer => {
  const Renderer = memo((props: ThemeSectionRendererProps) => (
    <AtelierFrame {...props} sectionType={sectionType} />
  ));
  Renderer.displayName = `Atelier${sectionType
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("")}`;
  return Renderer;
};

export const AtelierAnnouncementMarquee = sectionRenderer("announcement-marquee");
export const AtelierSiteHeader = sectionRenderer("site-header");
export const AtelierEditorialIntro = sectionRenderer("editorial-intro");
export const AtelierImmersiveProductHero = sectionRenderer("immersive-product-hero");
export const AtelierBrandStory = sectionRenderer("brand-story");
export const AtelierCraftsmanshipFeatures = sectionRenderer("craftsmanship-features");
export const AtelierFeaturedProductCollection = sectionRenderer("featured-product-collection");
export const AtelierCustomerStories = sectionRenderer("customer-stories");
export const AtelierSiteFooter = sectionRenderer("site-footer");

export const atelierSectionRenderers: Partial<Record<CanonicalSectionType, ThemeSectionRenderer>> = {
  "announcement-marquee": AtelierAnnouncementMarquee,
  "site-header": AtelierSiteHeader,
  "editorial-intro": AtelierEditorialIntro,
  "immersive-product-hero": AtelierImmersiveProductHero,
  "brand-story": AtelierBrandStory,
  "craftsmanship-features": AtelierCraftsmanshipFeatures,
  "featured-product-collection": AtelierFeaturedProductCollection,
  "customer-stories": AtelierCustomerStories,
  "site-footer": AtelierSiteFooter,
};
