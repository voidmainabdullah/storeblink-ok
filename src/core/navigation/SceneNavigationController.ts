import {
  legacyNavigationTarget,
  navigationSystem,
  resolveMenuTarget,
  type StorefrontLinkContext,
} from "@/content/menus";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { SceneNode, SceneTree } from "@/types";

export type NavigationViewItem = {
  id: string;
  label: string;
  href: string;
  external: boolean;
  target?: "_blank";
  rel?: "noopener noreferrer";
  broken?: boolean;
};

const fallbackPages = new Map([
  ["about", { id: "about", handle: "about", status: "published" as const }],
  ["contact", { id: "contact", handle: "contact", status: "published" as const }],
]);

export const resolveSceneNodeRoute = (
  storeSlug: string,
  node: SceneNode | undefined,
  linkContext: Partial<Omit<StorefrontLinkContext, "storeSlug">> = {},
): string | null => {
  if (!node) return null;
  const navigationTarget = node.extensions?.navigationTarget;
  const target = legacyNavigationTarget(navigationTarget);
  if (target) {
    const resolved = resolveMenuTarget(target, {
      storeSlug,
      ...linkContext,
      pages: linkContext.pages ?? fallbackPages,
    });
    if (resolved.href) {
      if (target.type === "page" && target.entityId === "about") {
        return `/store/${storeSlug}/about`;
      }
      if (target.type === "page" && target.entityId === "contact") {
        return `/store/${storeSlug}/contact`;
      }
      return resolved.href;
    }
    if (typeof navigationTarget !== "string") return null;
  }

  if (typeof navigationTarget !== "string") return null;
  const legacyTarget = navigationTarget.trim();
  if (!legacyTarget || /^javascript:/i.test(legacyTarget)) return null;
  if (legacyTarget.startsWith(`/store/${storeSlug}`)) return legacyTarget;
  if (legacyTarget.startsWith("/")) return `/store/${storeSlug}${legacyTarget}`;
  return `/store/${storeSlug}/${legacyTarget.replace(/^\/+/, "")}`;
};

export const resolveSceneNavigation = (
  storeSlug: string,
  scene: SceneTree,
  linkContext: Partial<Omit<StorefrontLinkContext, "storeSlug">> = {},
  breakpoint?: ResponsiveBreakpoint,
): NavigationViewItem[] => {
  const links = navigationSystem.resolve(scene, {
    storeSlug,
    ...linkContext,
    pages: linkContext.pages ?? fallbackPages,
  })
    .filter(
      ({ item, link }) =>
        item.isVisible &&
        (!breakpoint || item.visibility[breakpoint]) &&
        !link.hidden &&
        Boolean(link.href),
    )
    .map(({ item, link }) => ({
      id: item.id,
      label: item.label,
      href: link.href as string,
      external: link.external,
      target: item.openInNewTab || link.target === "_blank" ? "_blank" as const : undefined,
      rel:
        item.openInNewTab || link.rel === "noopener noreferrer"
          ? "noopener noreferrer" as const
          : undefined,
      broken: link.broken,
    }));

  if (links.length) return links;
  return [
    { id: "home", label: "Home", href: `/store/${storeSlug}`, external: false },
    { id: "products", label: "Products", href: `/store/${storeSlug}/products`, external: false },
    { id: "about", label: "About us", href: `/store/${storeSlug}/about`, external: false },
    { id: "contact", label: "Contact", href: `/store/${storeSlug}/contact`, external: false },
  ];
};
