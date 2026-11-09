import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.110.6";
import {
  decryptGoogleSecretWithMetadata,
  encryptGoogleSecret,
  googleTokenEncryptionKeyVersion,
} from "../_shared/domain/google.ts";
import { normalizeHostname } from "../_shared/domain/hostname.ts";

type JsonObject = Record<string, unknown>;

type DomainResolution = {
  storeId: string;
  storeHandle: string;
  requestedHostname: string;
  primaryHostname: string;
  redirectRequired: boolean;
  canonicalOrigin?: string;
};

const textResponse = (body: string, contentType: string, status = 200, headers: HeadersInit = {}) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

const safePath = (value: string | null): string => {
  if (!value || !value.startsWith("/") || value.length > 2_048) return "/";
  try {
    const parsed = new URL(value, "https://storeblink.invalid");
    return parsed.pathname;
  } catch {
    return "/";
  }
};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
};

const compactText = (value: unknown, fallback: string, maxLength = 300): string => {
  if (typeof value !== "string") return fallback;
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted ? compacted.slice(0, maxLength) : fallback;
};

type SafeMetaTag = {
  attribute: "name" | "property";
  key: string;
  content: string;
};

type SeoAlternate = { locale: string; url: string };

const safeMetaNames = new Set([
  "author", "keywords", "application-name", "theme-color", "color-scheme",
]);
const safeMetaProperty = /^(?:product|article|profile):[a-z0-9:_-]+$/;
const safeLocale = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

const absoluteHttpsUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

const firstPublicImage = (primary: unknown, images: unknown): string | null => {
  const direct = absoluteHttpsUrl(primary);
  if (direct) return direct;
  if (!Array.isArray(images)) return null;
  for (const entry of images) {
    const candidate = typeof entry === "string"
      ? entry
      : entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as JsonObject).url ?? (entry as JsonObject).src
        : null;
    const resolved = absoluteHttpsUrl(candidate);
    if (resolved) return resolved;
  }
  return null;
};

const safeCustomMetaTags = (value: unknown): SafeMetaTag[] => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const tag = entry as JsonObject;
    const attribute = tag.attribute;
    const key = typeof tag.key === "string" ? tag.key.trim().toLowerCase() : "";
    const content = typeof tag.content === "string"
      ? tag.content.replace(/[\u0000-\u001f\u007f]/g, " ").trim()
      : "";
    const allowed = attribute === "name"
      ? safeMetaNames.has(key)
      : attribute === "property" && safeMetaProperty.test(key);
    return allowed && content && content.length <= 500
      ? [{ attribute, key, content } as SafeMetaTag]
      : [];
  });
};

const safeAlternates = (value: unknown): SeoAlternate[] => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const alternate = entry as JsonObject;
    const locale = typeof alternate.locale === "string" ? alternate.locale.trim() : "";
    const url = absoluteHttpsUrl(alternate.url);
    return safeLocale.test(locale) && url ? [{ locale, url }] : [];
  });
};

const loadVerificationToken = async (
  client: SupabaseClient,
  domainId: string,
): Promise<string | null> => {
  const { data, error } = await client
    .from("google_site_verifications")
    .select("token_ciphertext,status,token_key_version")
    .eq("domain_id", domainId)
    .in("status", ["token_ready", "verified"])
    .maybeSingle();
  if (error || !data?.token_ciphertext) return null;
  try {
    const decrypted = await decryptGoogleSecretWithMetadata(
      String(data.token_ciphertext),
      `google-site-verification:${domainId}`,
    );
    if (decrypted.requiresReencryption) {
      const rotatedCiphertext = await encryptGoogleSecret(
        decrypted.value,
        `google-site-verification:${domainId}`,
      );
      const { error: rotationError } = await client
        .from("google_site_verifications")
        .update({
          token_ciphertext: rotatedCiphertext,
          token_key_version: googleTokenEncryptionKeyVersion(),
        })
        .eq("domain_id", domainId)
        .eq("token_ciphertext", String(data.token_ciphertext));
      if (rotationError) {
        console.error("Google verification token rotation could not be persisted", {
          domainId,
          code: rotationError.code,
        });
      }
    }
    return decrypted.value;
  } catch (decryptError) {
    console.error("Google verification token could not be decrypted", {
      domainId,
      name: decryptError instanceof Error ? decryptError.name : "UnknownError",
    });
    return null;
  }
};

const loadStorefrontHead = async (
  client: SupabaseClient,
  resolution: DomainResolution,
  path: string,
) => {
  const { data: store, error: storeError } = await client
    .from("stores")
    .select("id,owner_user_id,name,handle,currency,brand_profile")
    .eq("id", resolution.storeId)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();
  if (storeError || !store) return null;
  const { data: profile } = await client
    .from("profiles")
    .select("business_name,store_tagline,store_about,store_banner_url")
    .eq("id", store.owner_user_id)
    .maybeSingle();
  const storeName = compactText(profile?.business_name ?? store.name, "Store", 120);
  const defaultDescription = compactText(
    profile?.store_tagline ?? profile?.store_about,
    `Shop ${storeName} online.`,
    300,
  );
  const canonicalOrigin = resolution.canonicalOrigin ?? `https://${resolution.primaryHostname}`;
  const requestedCanonicalPath = path === "/home" ? "/" : path;
  let resourceLookupRoute = requestedCanonicalPath;
  let title = storeName;
  let description = defaultDescription;
  let image = absoluteHttpsUrl(profile?.store_banner_url);
  let noindex = false;
  let httpStatus: 200 | 404 = 200;
  let robotsOverride: "noindex,follow" | null = null;
  let structuredData: JsonObject = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: storeName,
    url: canonicalOrigin,
    ...(image ? { logo: image } : {}),
  };

  if (path === "/products") {
    title = `Products | ${storeName}`;
    description = `Browse products from ${storeName}.`;
  } else if (path === "/about" || path === "/contact" || path.startsWith("/pages/")) {
    const handle = path === "/about"
      ? "about"
      : path === "/contact"
        ? "contact"
        : safeDecode(path.slice("/pages/".length));
    const { data: page } = await client
      .from("store_pages")
      .select("title,seo")
      .eq("store_id", resolution.storeId)
      .eq("handle", handle)
      .eq("status", "published")
      .is("deleted_at", null)
      .maybeSingle();
    if (!page) {
      noindex = true;
      httpStatus = 404;
      title = `Page not found | ${storeName}`;
    } else {
      const seo = page.seo && typeof page.seo === "object" ? page.seo as JsonObject : {};
      title = compactText(seo.title ?? page.title, page.title, 120);
      description = compactText(seo.description, `${page.title} from ${storeName}.`, 300);
      image = absoluteHttpsUrl(seo.image) ?? image;
    }
  } else if (path.startsWith("/collections/")) {
    const handle = safeDecode(path.slice("/collections/".length));
    const { data: collection } = await client
      .from("store_collections")
      .select("title,handle")
      .eq("store_id", resolution.storeId)
      .eq("handle", handle)
      .eq("status", "published")
      .is("deleted_at", null)
      .maybeSingle();
    if (!collection) {
      noindex = true;
      httpStatus = 404;
      title = `Collection not found | ${storeName}`;
    } else {
      const publicHandle = compactText(collection.handle, handle, 120);
      const collectionTitle = compactText(collection.title, "Collection", 120);
      resourceLookupRoute = `/collections/${publicHandle}`;
      title = `${collectionTitle} | ${storeName}`;
      description = `Browse the ${collectionTitle} collection from ${storeName}.`;
      structuredData = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: collectionTitle,
        description,
      };
    }
  } else if (path.startsWith("/products/") || path.startsWith("/product/")) {
    const prefix = path.startsWith("/products/") ? "/products/" : "/product/";
    const identifier = safeDecode(path.slice(prefix.length));
    let productQuery = client
      .from("items")
      .select("id,handle,name,description,image_url,images,price_cents,stock")
      .eq("store_id", resolution.storeId)
      .eq("is_published", true);
    productQuery = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(identifier)
      ? productQuery.eq("id", identifier)
      : productQuery.eq("handle", identifier);
    const { data: product } = await productQuery.maybeSingle();
    if (!product) {
      noindex = true;
      httpStatus = 404;
      title = `Product not found | ${storeName}`;
    } else {
      const publicIdentifier = typeof product.handle === "string" && product.handle.trim()
        ? product.handle.trim()
        : String(product.id);
      resourceLookupRoute = `/products/${publicIdentifier}`;
      title = `${compactText(product.name, "Product", 100)} | ${storeName}`;
      description = compactText(product.description, `Shop ${product.name} from ${storeName}.`, 300);
      image = firstPublicImage(product.image_url, product.images) ?? image;
      structuredData = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: compactText(product.name, "Product", 160),
        description,
        ...(image ? { image: [image] } : {}),
        offers: {
          "@type": "Offer",
          url: `${canonicalOrigin}${resourceLookupRoute}`,
          priceCurrency: String(store.currency ?? "USD"),
          price: (Math.max(0, Number(product.price_cents ?? 0)) / 100).toFixed(2),
          availability: Number(product.stock ?? 0) > 0
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        },
      };
    }
  } else if (path !== "/" && path !== "/home") {
    noindex = true;
    httpStatus = 404;
    title = `Page not found | ${storeName}`;
  }

  let canonicalUrl = resourceLookupRoute === "/"
    ? canonicalOrigin
    : `${canonicalOrigin}${resourceLookupRoute}`;
  let socialTitle = title;
  let socialDescription = description;
  let socialImage = absoluteHttpsUrl(image);
  let customMetaTags: SafeMetaTag[] = [];
  let alternates: SeoAlternate[] = [];
  const { data: seoResource, error: seoResourceError } = await client
    .from("seo_resources")
    .select("resource_type,resource_id,status,is_private")
    .eq("store_id", resolution.storeId)
    .eq("route", resourceLookupRoute)
    .maybeSingle();
  if (!seoResourceError && seoResource) {
    const resource = seoResource as unknown as JsonObject;
    const { data: metadata, error: metadataError } = await client
      .from("seo_metadata")
      .select(
        "seo_title,meta_description,indexing,canonical_mode,custom_canonical_url," +
          "social_title,social_description,social_image_id,custom_meta_tags,alternates",
      )
      .eq("store_id", resolution.storeId)
      .eq("resource_type", String(resource.resource_type))
      .eq("resource_id", String(resource.resource_id))
      .maybeSingle();
    if (!metadataError && metadata) {
      const resolvedMetadata = metadata as unknown as JsonObject;
      title = compactText(resolvedMetadata.seo_title, title, 120);
      description = compactText(resolvedMetadata.meta_description, description, 320);
      socialTitle = compactText(resolvedMetadata.social_title, title, 120);
      socialDescription = compactText(resolvedMetadata.social_description, description, 320);
      socialImage = absoluteHttpsUrl(resolvedMetadata.social_image_id) ?? socialImage;
      customMetaTags = safeCustomMetaTags(resolvedMetadata.custom_meta_tags);
      alternates = safeAlternates(resolvedMetadata.alternates);
      const customCanonical = absoluteHttpsUrl(resolvedMetadata.custom_canonical_url);
      if (resolvedMetadata.canonical_mode === "custom" && customCanonical) {
        canonicalUrl = customCanonical;
      }
      if (resolvedMetadata.indexing === "noindex_follow") {
        noindex = true;
        robotsOverride = "noindex,follow";
      } else if (resolvedMetadata.indexing === "noindex_nofollow") {
        noindex = true;
      }
      if (resource.status !== "published" || resource.is_private === true) noindex = true;
    }
  }

  if (structuredData["@type"] === "Product") {
    const offers = structuredData.offers && typeof structuredData.offers === "object"
      ? structuredData.offers as JsonObject
      : {};
    structuredData = { ...structuredData, url: canonicalUrl, offers: { ...offers, url: canonicalUrl } };
  } else {
    structuredData = { ...structuredData, url: canonicalUrl };
  }

  const { data: domain } = await client
    .from("store_domains")
    .select("id")
    .eq("store_id", resolution.storeId)
    .eq("hostname", resolution.requestedHostname)
    .eq("status", "active")
    .maybeSingle();
  const verificationToken = domain
    ? await loadVerificationToken(client, String(domain.id))
    : null;
  const robots = noindex
    ? (robotsOverride ?? "noindex,nofollow")
    : "index,follow,max-image-preview:large";
  return {
    httpStatus,
    title,
    description,
    canonicalUrl,
    robots,
    image,
    socialTitle,
    socialDescription,
    socialImage,
    customMetaTags,
    alternates,
    googleSiteVerification: verificationToken,
    structuredData,
  };
};

serve(async (request) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return textResponse("Method not allowed", "text/plain; charset=utf-8", 405, { Allow: "GET, HEAD" });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return textResponse("Service unavailable", "text/plain; charset=utf-8", 503);
  }

  let hostname: string;
  try {
    hostname = normalizeHostname((
      request.headers.get("x-storeblink-host") ??
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      ""
    ).split(",")[0].trim());
  } catch {
    return textResponse("Store not found", "text/plain; charset=utf-8", 404);
  }

  const client = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const url = new URL(request.url);
  const requestedHandle = url.searchParams.get("storeHandle")?.trim().toLowerCase() ?? "";
  let resolution: DomainResolution | null = null;
  if (requestedHandle && /^[a-z0-9][a-z0-9-]{0,62}$/.test(requestedHandle)) {
    const { data: store } = await client
      .from("stores")
      .select("id,handle")
      .eq("handle", requestedHandle)
      .eq("status", "published")
      .is("deleted_at", null)
      .maybeSingle();
    if (store) {
      const { data: primaryDomain } = await client
        .from("store_domains")
        .select("hostname")
        .eq("store_id", store.id)
        .eq("is_primary", true)
        .eq("status", "active")
        .maybeSingle();
      const primaryHostname = primaryDomain?.hostname
        ? normalizeHostname(String(primaryDomain.hostname))
        : "storeblink.com";
      resolution = {
        storeId: String(store.id),
        storeHandle: String(store.handle),
        requestedHostname: hostname,
        primaryHostname,
        redirectRequired: false,
        canonicalOrigin: primaryDomain?.hostname
          ? `https://${primaryHostname}`
          : `https://storeblink.com/store/${encodeURIComponent(String(store.handle))}`,
      };
    }
  } else {
    const { data, error } = await client.rpc("resolve_public_storefront_by_domain", {
      p_hostname: hostname,
    });
    if (!error && data) resolution = data as DomainResolution;
  }
  if (!resolution) {
    return textResponse("Store not found", "text/plain; charset=utf-8", 404);
  }
  const resource = url.searchParams.get("resource") ?? "";
  const requestedPath = safePath(url.searchParams.get("path"));
  if (resolution.redirectRequired) {
    const redirectPath = resource === "head" ? requestedPath : resource === "sitemap" ? "/sitemap.xml" : "/robots.txt";
    return new Response(null, {
      status: 301,
      headers: {
        Location: `https://${resolution.primaryHostname}${redirectPath}`,
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      },
    });
  }

  const canonicalOrigin = `https://${resolution.primaryHostname}`;
  if (resource === "head") {
    const head = await loadStorefrontHead(client, resolution, requestedPath);
    return head ? jsonResponse(head) : jsonResponse({ error: "Store not found" }, 404);
  }

  if (resource === "robots") {
    const robots = [
      "User-agent: *",
      "Allow: /",
      "Disallow: /preview",
      "Disallow: /password",
      "Disallow: /auth",
      "Disallow: /dashboard",
      "Disallow: /domain",
      "Disallow: /main-admin",
      "Disallow: /account",
      "Disallow: /cart",
      "Disallow: /checkout",
      `Sitemap: ${canonicalOrigin}/sitemap.xml`,
      "",
    ].join("\n");
    return request.method === "HEAD"
      ? textResponse("", "text/plain; charset=utf-8")
      : textResponse(robots, "text/plain; charset=utf-8");
  }

  if (resource !== "sitemap") {
    return textResponse("Not found", "text/plain; charset=utf-8", 404);
  }
  return textResponse(
    "Compiled sitemap artifacts are served by the StoreBlink storefront edge.",
    "text/plain; charset=utf-8",
    503,
    { "Retry-After": "300" },
  );
});
