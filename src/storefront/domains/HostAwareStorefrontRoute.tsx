import { useEffect, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import Store, { type StoreRoutePage } from "@/pages/Store";
import ProductDetail from "@/pages/ProductDetail";
import { StorefrontHead } from "@/storefront/seo/StorefrontHead";
import {
  isPlatformHostname,
  publicDomainResolver,
  type PublicDomainResolution,
} from "./PublicDomainResolver";

type ResolutionState =
  | { status: "loading" }
  | { status: "not-custom" }
  | { status: "not-found" }
  | { status: "ready"; resolution: PublicDomainResolution };

const useHostResolution = (): ResolutionState => {
  const [state, setState] = useState<ResolutionState>(() =>
    isPlatformHostname(window.location.hostname)
      ? { status: "not-custom" }
      : { status: "loading" },
  );
  useEffect(() => {
    if (state.status === "not-custom") return;
    let active = true;
    void publicDomainResolver.resolve(window.location.hostname)
      .then((resolution) => {
        if (!active) return;
        if (!resolution) {
          setState({ status: "not-found" });
          return;
        }
        if (resolution.redirectRequired) {
          window.location.replace(
            `https://${resolution.primaryHostname}${window.location.pathname}${window.location.search}`,
          );
          return;
        }
        setState({ status: "ready", resolution });
      })
      .catch(() => active && setState({ status: "not-found" }));
    return () => { active = false; };
  }, [state.status]);
  return state;
};

const RuntimeFallback = ({ notFound = false }: { notFound?: boolean }) => (
  <div className="grid min-h-screen place-items-center bg-background p-6">
    {notFound ? (
      <>
        <StorefrontHead
          title="Store not found"
          canonicalUrl={`${window.location.origin}${window.location.pathname}`}
          noindex
        />
        <Card className="w-full max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">Store not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">This domain is not connected to an active StoreBlink storefront.</p>
        </Card>
      </>
    ) : <span className="text-sm text-muted-foreground">Loading store...</span>}
  </div>
);

const PageNotFound = ({ primaryHostname }: { primaryHostname: string }) => (
  <div className="grid min-h-screen place-items-center bg-background p-6">
    <StorefrontHead
      title="Page not found"
      canonicalUrl={`https://${primaryHostname}/`}
      noindex
    />
    <Card className="w-full max-w-md p-8 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This page is not available in the storefront.
      </p>
      <a className="mt-5 inline-flex text-sm font-medium underline underline-offset-4" href="/">
        Back to store
      </a>
    </Card>
  </div>
);

export const HostAwareStorefrontRoute = ({
  page,
  platformElement,
}: {
  page: StoreRoutePage;
  platformElement?: ReactNode;
}) => {
  const state = useHostResolution();
  if (state.status === "not-custom") return <>{platformElement ?? <RuntimeFallback notFound />}</>;
  if (state.status === "loading") return <RuntimeFallback />;
  if (state.status === "not-found") return <RuntimeFallback notFound />;
  return <Store page={page} slugOverride={state.resolution.storeHandle} customDomain />;
};

export const HostAwareProductRoute = ({ platformElement }: { platformElement?: ReactNode }) => {
  const state = useHostResolution();
  if (state.status === "not-custom") return <>{platformElement ?? <RuntimeFallback notFound />}</>;
  if (state.status === "loading") return <RuntimeFallback />;
  if (state.status === "not-found") return <RuntimeFallback notFound />;
  return <ProductDetail slugOverride={state.resolution.storeHandle} customDomain />;
};

export const HostAwareStorefrontNotFoundRoute = () => {
  const state = useHostResolution();
  if (state.status === "loading") return <RuntimeFallback />;
  if (state.status === "ready") {
    return <Store page="404" slugOverride={state.resolution.storeHandle} customDomain />;
  }
  return <RuntimeFallback notFound />;
};
