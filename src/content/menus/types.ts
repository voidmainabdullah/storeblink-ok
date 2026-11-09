export type MenuTargetType =
  | "route"
  | "home"
  | "catalog"
  | "page"
  | "product"
  | "collection"
  | "blog"
  | "search"
  | "account"
  | "external"
  | "email"
  | "phone"
  | "section";

export type StoreRouteKey =
  | "home"
  | "products"
  | "about"
  | "contact"
  | "search"
  | "account"
  | "cart"
  | "checkout";

export type MenuTarget = {
  type: MenuTargetType;
  entityId?: string;
  value?: string;
  routeKey?: StoreRouteKey;
  sectionId?: string;
};

export type MenuItemVisibility = {
  desktop: boolean;
  tablet: boolean;
  mobile: boolean;
};

export type StoreMenuItem = {
  id: string;
  menuId: string;
  storeId: string;
  label: string;
  target: MenuTarget;
  parentId: string | null;
  sortOrder: number;
  openInNewTab: boolean;
  isVisible: boolean;
  visibility: MenuItemVisibility;
  icon?: {
    library: string;
    name: string;
    color: string;
    size: number;
  } | null;
  metadata?: Record<string, unknown>;
};

export type StoreMenu = {
  id: string;
  storeId: string;
  key: string;
  name: string;
  items: StoreMenuItem[];
};

export type LinkableEntity = {
  id: string;
  handle: string;
  route?: string;
  status?: "draft" | "published" | "hidden" | "active" | "archived";
  deletedAt?: string | null;
};

export type ResolvedMenuLink = {
  href: string | null;
  external: boolean;
  broken: boolean;
  hidden: boolean;
  reason?: string;
  target?: "_blank";
  rel?: "noopener noreferrer";
};

export type StorefrontLinkContext = {
  storeSlug: string;
  pages?: ReadonlyMap<string, LinkableEntity>;
  products?: ReadonlyMap<string, LinkableEntity>;
  collections?: ReadonlyMap<string, LinkableEntity>;
  sectionIds?: ReadonlySet<string>;
};

export type SceneNavigationItem = Omit<
  StoreMenuItem,
  "menuId" | "storeId"
>;

export type SceneNavigationDocument = {
  version: 1;
  items: SceneNavigationItem[];
};
