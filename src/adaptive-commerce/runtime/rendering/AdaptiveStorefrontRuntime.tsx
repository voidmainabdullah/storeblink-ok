import { useMemo } from "react";
import type { RuntimeArtifact, StorefrontResourceType } from "@/adaptive-commerce/contracts";
import { AdaptiveFooter, AdaptiveHeader } from "./AdaptiveChrome";
import { AdaptiveSection } from "./AdaptiveSection";
import {
  createCommerceRuntimeData,
  resolveRuntimeComponentProps,
  runtimeTokenStyle,
} from "./runtimeData";
import {
  parseRuntimeGlobalReference,
  parseRuntimeRenderDocument,
  type AdaptiveStorefrontCart,
  type AdaptiveStorefrontNavigationItem,
  type AdaptiveStorefrontPageContent,
  type AdaptiveStorefrontProduct,
} from "./types";
import adaptiveStorefrontCss from "./adaptive-storefront.css?raw";

const RTL_LOCALES = new Set(["ar", "dv", "fa", "he", "ku", "ps", "ur"]);

const storefrontDirection = (locale: string): "ltr" | "rtl" =>
  RTL_LOCALES.has(locale.toLowerCase().split(/[-_]/, 1)[0]) ? "rtl" : "ltr";

export type AdaptiveStorefrontRuntimeProps = Readonly<{
  artifact: RuntimeArtifact;
  resourceType: StorefrontResourceType;
  storeName: string;
  bannerUrl?: string | null;
  products: readonly AdaptiveStorefrontProduct[];
  currentProduct?: AdaptiveStorefrontProduct | null;
  collectionTitle?: string;
  page?: AdaptiveStorefrontPageContent | null;
  searchQuery?: string;
  cart: AdaptiveStorefrontCart;
  navigation: readonly AdaptiveStorefrontNavigationItem[];
  homeHref: string;
  productsHref: string;
  cartHref: string;
  searchHref: string;
  productHref: (product: AdaptiveStorefrontProduct) => string;
  onRenderError?: (code: string) => void;
}>;

export const AdaptiveStorefrontRuntime = (props: AdaptiveStorefrontRuntimeProps) => {
  const document = useMemo(
    () => parseRuntimeRenderDocument(props.artifact, props.resourceType),
    [props.artifact, props.resourceType],
  );
  const commerceData = useMemo(() => createCommerceRuntimeData({
    storeName: props.storeName,
    navigation: props.navigation,
    products: props.products,
    currentProduct: props.currentProduct,
    collectionTitle: props.collectionTitle,
    page: props.page,
    cart: props.cart,
    searchQuery: props.searchQuery,
  }), [
    props.cart,
    props.collectionTitle,
    props.currentProduct,
    props.navigation,
    props.page,
    props.products,
    props.searchQuery,
    props.storeName,
  ]);
  const globalReferences = document.globalRegionPaths.map((path) =>
    parseRuntimeGlobalReference(props.artifact, path));
  const header = globalReferences.find((reference) => reference.regionSlot === "header");
  const footer = globalReferences.find((reference) => reference.regionSlot === "footer");
  if (!header || header.component.id !== "site-header" || !footer || footer.component.id !== "site-footer") {
    props.onRenderError?.("ADAPTIVE_GLOBALS_UNAVAILABLE");
    throw new Error("The compiled storefront is missing its certified header or footer.");
  }

  return (
    <>
      <style data-adaptive-storefront-styles="v3">{adaptiveStorefrontCss}</style>
      <div
        className="sb-adaptive-storefront"
        data-adaptive-runtime="v3"
        data-store-kit={`${props.artifact.storeKit.id}@${props.artifact.storeKit.version}`}
        data-artifact-hash={props.artifact.artifactHash}
        style={runtimeTokenStyle(props.artifact)}
        dir={storefrontDirection(document.locale)}
      >
      <AdaptiveHeader
        storeName={props.storeName}
        homeHref={props.homeHref}
        cartHref={props.cartHref}
        cartCount={props.cart.count}
        navigation={props.navigation}
      />
      <main className={`sb-adaptive-main sb-adaptive-main--${props.resourceType}`}>
        <div className="sb-adaptive-container">
          {document.sections.map((reference) => {
            let componentProps;
            try {
              componentProps = resolveRuntimeComponentProps(props.artifact, reference, commerceData);
            } catch (error) {
              props.onRenderError?.("ADAPTIVE_BINDING_RESOLUTION_FAILED");
              throw error;
            }
            return (
              <AdaptiveSection
                key={reference.path}
                reference={reference}
                props={componentProps}
                products={props.products}
                currentProduct={props.currentProduct}
                page={props.page}
                cart={props.cart}
                locale={document.locale}
                currency={document.currency}
                bannerUrl={props.bannerUrl}
                homeHref={props.homeHref}
                productsHref={props.productsHref}
                searchHref={props.searchHref}
                productHref={props.productHref}
              />
            );
          })}
        </div>
      </main>
        <AdaptiveFooter storeName={props.storeName} homeHref={props.homeHref} navigation={props.navigation} />
      </div>
    </>
  );
};
