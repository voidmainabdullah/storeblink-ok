import type {
  LinkableEntity,
  MenuTarget,
  ResolvedMenuLink,
  StorefrontLinkContext,
} from "./types";

const safeStoreSlug = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");

export const sectionAnchorDomId = (sectionId: string): string =>
  `section-${sectionId.trim().replace(/[^a-zA-Z0-9_-]/g, "-")}`;

const entityLink = (
  entities: ReadonlyMap<string, LinkableEntity> | undefined,
  entityId: string | undefined,
  prefix: string,
  storeBase: string,
): ResolvedMenuLink => {
  const entity = entityId ? entities?.get(entityId) : undefined;
  if (!entity || entity.deletedAt || entity.status === "hidden" || entity.status === "archived") {
    return {
      href: null,
      external: false,
      broken: true,
      hidden: true,
      reason: "The linked destination is missing or unavailable.",
    };
  }
  return {
    href: `${storeBase}/${prefix}/${encodeURIComponent(entity.handle)}`,
    external: false,
    broken: false,
    hidden: false,
  };
};

const externalLink = (value: string | undefined): ResolvedMenuLink => {
  const input = value?.trim() ?? "";
  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported protocol");
    return {
      href: input,
      external: true,
      broken: false,
      hidden: false,
      target: "_blank",
      rel: "noopener noreferrer",
    };
  } catch {
    return {
      href: null,
      external: true,
      broken: true,
      hidden: true,
      reason: "The external URL is invalid or unsafe.",
    };
  }
};

export const resolveMenuTarget = (
  target: MenuTarget,
  context: StorefrontLinkContext,
): ResolvedMenuLink => {
  const storeBase = `/store/${encodeURIComponent(safeStoreSlug(context.storeSlug))}`;
  switch (target.type) {
    case "route": {
      const route = target.routeKey;
      if (!route) {
        return {
          href: null,
          external: false,
          broken: true,
          hidden: true,
          reason: "The internal route is missing.",
        };
      }
      const paths: Record<NonNullable<MenuTarget["routeKey"]>, string> = {
        home: "",
        products: "/products",
        about: "/about",
        contact: "/contact",
        search: "/search",
        account: "/account",
        cart: "?cart=1",
        checkout: "/checkout",
      };
      return {
        href: `${storeBase}${paths[route]}`,
        external: false,
        broken: false,
        hidden: false,
      };
    }
    case "home":
      return { href: storeBase, external: false, broken: false, hidden: false };
    case "catalog":
      return { href: `${storeBase}/products`, external: false, broken: false, hidden: false };
    case "search":
      return { href: `${storeBase}/search`, external: false, broken: false, hidden: false };
    case "account":
      return { href: `${storeBase}/account`, external: false, broken: false, hidden: false };
    case "page":
      return entityLink(context.pages, target.entityId, "pages", storeBase);
    case "product":
      return entityLink(context.products, target.entityId, "products", storeBase);
    case "collection": {
      const entity = target.entityId
        ? context.collections?.get(target.entityId)
        : undefined;
      if (
        !entity ||
        entity.deletedAt ||
        entity.status === "hidden" ||
        entity.status === "archived"
      ) {
        return {
          href: null,
          external: false,
          broken: true,
          hidden: true,
          reason: "The linked collection is missing or unavailable.",
        };
      }
      const route = entity.route?.startsWith("/") && !entity.route.startsWith("//")
        ? entity.route
        : `/collections/${encodeURIComponent(entity.handle)}`;
      return {
        href: `${storeBase}${route}`,
        external: false,
        broken: false,
        hidden: false,
      };
    }
    case "blog":
      return target.value
        ? {
            href: `${storeBase}/blogs/${encodeURIComponent(target.value)}`,
            external: false,
            broken: false,
            hidden: false,
          }
        : { href: null, external: false, broken: true, hidden: true, reason: "Blog handle is missing." };
    case "email": {
      const email = target.value?.trim() ?? "";
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      return {
        href: valid ? `mailto:${email}` : null,
        external: true,
        broken: !valid,
        hidden: !valid,
        reason: valid ? undefined : "Email address is invalid.",
      };
    }
    case "phone": {
      const phone = (target.value ?? "").replace(/[^\d+]/g, "");
      const valid = /^\+?\d{7,15}$/.test(phone);
      return {
        href: valid ? `tel:${phone}` : null,
        external: true,
        broken: !valid,
        hidden: !valid,
        reason: valid ? undefined : "Phone number is invalid.",
      };
    }
    case "external":
      return externalLink(target.value);
    case "section": {
      const sectionId = target.sectionId?.trim();
      const available =
        Boolean(sectionId) &&
        (!context.sectionIds || context.sectionIds.has(sectionId as string));
      return {
        href: available ? `#${sectionAnchorDomId(sectionId as string)}` : null,
        external: false,
        broken: !available,
        hidden: !available,
        reason: available ? undefined : "The linked section is missing.",
      };
    }
  }
};

export const normalizeMenuTarget = (target: MenuTarget): MenuTarget => {
  if (target.type === "home") return { type: "route", routeKey: "home" };
  if (target.type === "catalog") return { type: "route", routeKey: "products" };
  if (target.type === "search") return { type: "route", routeKey: "search" };
  if (target.type === "account") return { type: "route", routeKey: "account" };
  if (target.type === "page" && target.entityId === "about") {
    return { type: "route", routeKey: "about" };
  }
  if (target.type === "page" && target.entityId === "contact") {
    return { type: "route", routeKey: "contact" };
  }
  return structuredClone(target);
};

export const legacyNavigationTarget = (value: unknown): MenuTarget | null => {
  if (value && typeof value === "object" && "type" in value) {
    const target = value as Partial<MenuTarget>;
    if (typeof target.type === "string") {
      return normalizeMenuTarget(target as MenuTarget);
    }
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized === "home") return { type: "route", routeKey: "home" };
  if (normalized === "products" || normalized === "catalog") {
    return { type: "route", routeKey: "products" };
  }
  if (normalized === "about") return { type: "route", routeKey: "about" };
  if (normalized === "contact") return { type: "route", routeKey: "contact" };
  if (/^https?:\/\//i.test(normalized)) return { type: "external", value: normalized };
  if (/^(mailto:)/i.test(normalized)) return { type: "email", value: normalized.slice(7) };
  if (/^(tel:)/i.test(normalized)) return { type: "phone", value: normalized.slice(4) };
  if (normalized.startsWith("#section-")) {
    return { type: "section", sectionId: normalized.slice("#section-".length) };
  }
  const customPage = normalized.match(/^\/?pages\/([^/?#]+)/i);
  if (customPage) return { type: "page", entityId: decodeURIComponent(customPage[1]) };
  return null;
};
