import { useEffect } from "react";

type StorefrontHeadProps = {
  title: string;
  description?: string | null;
  canonicalUrl: string;
  noindex?: boolean;
};

const ensureMeta = (name: string) => {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[data-storeblink-seo="${name}"]`,
  );
  if (!element) {
    element = document.createElement("meta");
    element.dataset.storeblinkSeo = name;
    element.name = name;
    document.head.appendChild(element);
  }
  return element;
};

const ensureCanonical = () => {
  let element = document.head.querySelector<HTMLLinkElement>(
    'link[data-storeblink-seo="canonical"]',
  );
  if (!element) {
    element = document.createElement("link");
    element.dataset.storeblinkSeo = "canonical";
    element.rel = "canonical";
    document.head.appendChild(element);
  }
  return element;
};

export const StorefrontHead = ({
  title,
  description,
  canonicalUrl,
  noindex = false,
}: StorefrontHeadProps) => {
  useEffect(() => {
    const edgeRoute = document.head.querySelector<HTMLMetaElement>(
      'meta[data-storeblink-edge-seo="route"]',
    );
    if (edgeRoute) {
      if (edgeRoute.content === window.location.pathname) return undefined;
      document.head.querySelectorAll("[data-storeblink-edge-seo]").forEach((element) => element.remove());
    }
    const previousTitle = document.title;
    document.title = title;
    const descriptionElement = ensureMeta("description");
    descriptionElement.content = description?.trim() || title;
    const robotsElement = ensureMeta("robots");
    robotsElement.content = noindex ? "noindex,nofollow" : "index,follow";
    const canonicalElement = ensureCanonical();
    canonicalElement.href = canonicalUrl;
    return () => {
      document.title = previousTitle;
      descriptionElement.remove();
      robotsElement.remove();
      canonicalElement.remove();
    };
  }, [canonicalUrl, description, noindex, title]);
  return null;
};
