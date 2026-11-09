import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { createEditorStoreDataService } from "@/platform/editor-data";
import Store, {
  type StorePreviewSource,
  type StoreRoutePage,
} from "@/pages/Store";

const allowedPages = new Set<StoreRoutePage>([
  "home",
  "products",
  "about",
  "contact",
  "custom",
]);

const StorefrontPreview = () => {
  const { currentStore, user } = useAuth();
  const [searchParams] = useSearchParams();
  const previewData = useMemo(() => createEditorStoreDataService(), []);
  const requestedPage = searchParams.get("page") as StoreRoutePage | null;
  const page = requestedPage && allowedPages.has(requestedPage)
    ? requestedPage
    : "home";

  const previewSource = useMemo<StorePreviewSource | null>(() => {
    if (!currentStore || !user) return null;
    const storeId = currentStore.id;
    return {
      storeId,
      load: () => previewData.load(user, storeId),
    };
  }, [currentStore, previewData, user]);

  if (!currentStore || !previewSource) return null;

  return (
    <Store
      page={page}
      slugOverride={currentStore.handle}
      previewSource={previewSource}
      pageSlugOverride={searchParams.get("pageSlug") ?? undefined}
    />
  );
};

export default StorefrontPreview;
