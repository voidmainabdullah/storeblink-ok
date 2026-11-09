import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import EngineEditor from "./EngineEditor";
import { EngineProvider, createEditorKernel } from "@/engine/kernel";
import { useAuth } from "@/hooks/useAuth";
import { editorSessionCache } from "@/persistence/project-save-load";
import {
  getAdaptiveAuthoringGateway,
  type AdaptiveAuthoringGateway,
  type AdaptiveAuthoringSource,
} from "@/adaptive-commerce/authoring";
import { Button } from "@/components/ui/button";
import { AdaptiveStoreEditor } from "./AdaptiveStoreEditor";
import {
  SupabaseStoreKitInstallationRevisionGateway,
  SupabaseStoreKitInstallationStageGateway,
  createBuiltInLegacyAdaptiveUpgradeController,
  type InstallationRevisionQueryClient,
  type InstallationRpcClient,
  type LegacyAdaptiveStoreKitUpgradeController,
  type StoreKitInstallationStageResult,
} from "@/adaptive-commerce/installation";
import { createBuiltInAdaptiveCommerceCatalog } from "@/adaptive-commerce/fixtures";
import { getSupabaseBrowserClient } from "@/platform/supabase/client";
import { LegacyAdaptiveStoreKitUpgradeEntry } from "./LegacyAdaptiveStoreKitUpgradeEntry";

type AdaptiveSourceState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "legacy" }>
  | Readonly<{ status: "adaptive"; source: AdaptiveAuthoringSource }>
  | Readonly<{ status: "error"; message: string }>;

const LegacyStoreEditor = ({
  storeId,
  headerActions,
}: Readonly<{ storeId: string; headerActions?: ReactNode }>) => {
  const warmSession = useMemo(() => editorSessionCache.get(storeId), [storeId]);
  const kernel = useMemo(
    () => createEditorKernel({ initialScene: warmSession?.scene }),
    [warmSession],
  );
  return (
    <EngineProvider key={storeId} kernel={kernel}>
      <EngineEditor initialSession={warmSession} headerActions={headerActions} />
    </EngineProvider>
  );
};

let browserUpgradeController: LegacyAdaptiveStoreKitUpgradeController | null = null;

const getBrowserUpgradeController = (): LegacyAdaptiveStoreKitUpgradeController => {
  if (browserUpgradeController) return browserUpgradeController;
  const client = getSupabaseBrowserClient();
  browserUpgradeController = createBuiltInLegacyAdaptiveUpgradeController(
    createBuiltInAdaptiveCommerceCatalog(),
    new SupabaseStoreKitInstallationStageGateway(
      client as unknown as InstallationRpcClient,
    ),
    new SupabaseStoreKitInstallationRevisionGateway(
      client as unknown as InstallationRevisionQueryClient,
    ),
  );
  return browserUpgradeController;
};

export type MyStoreProps = Readonly<{
  authoringGateway?: AdaptiveAuthoringGateway;
  upgradeController?: LegacyAdaptiveStoreKitUpgradeController;
}>;

export const MyStore = ({ authoringGateway, upgradeController }: MyStoreProps) => {
  const { bootstrap, currentStore, hasCapability } = useAuth();
  const gateway = useMemo(
    () => authoringGateway ?? getAdaptiveAuthoringGateway(),
    [authoringGateway],
  );
  const [reloadVersion, setReloadVersion] = useState(0);
  const [sourceState, setSourceState] = useState<AdaptiveSourceState>({ status: "loading" });

  const openStagedAdaptiveSource = useCallback(async (
    result: StoreKitInstallationStageResult,
  ) => {
    if (!currentStore?.id) throw new Error("No authorized store is available.");
    const source = await gateway.load(currentStore.id);
    if (
      !source
      || source.storeId !== currentStore.id
      || source.installationId !== result.installation.id
      || source.installationStatus !== "staged"
    ) {
      throw new Error("The exact staged source was not returned by the authoring boundary.");
    }
    setSourceState({ status: "adaptive", source });
  }, [currentStore?.id, gateway]);

  useEffect(() => {
    let active = true;
    if (!currentStore?.id) {
      setSourceState({ status: "error", message: "No authorized store is available." });
      return () => { active = false; };
    }
    setSourceState({ status: "loading" });
    void gateway.load(currentStore.id).then((source) => {
      if (!active) return;
      setSourceState(source ? { status: "adaptive", source } : { status: "legacy" });
    }).catch((error: unknown) => {
      if (!active) return;
      setSourceState({
        status: "error",
        message: error instanceof Error ? error.message : "The storefront editor assignment could not be verified.",
      });
    });
    return () => { active = false; };
  }, [currentStore?.id, gateway, reloadVersion]);

  if (sourceState.status === "loading") {
    return (
      <div className="grid min-h-[60vh] place-items-center" role="status">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <RefreshCw className="animate-spin" size={17} aria-hidden="true" />
          Checking the storefront editor…
        </div>
      </div>
    );
  }
  if (sourceState.status === "error") {
    return (
      <div className="grid min-h-[60vh] place-items-center p-6">
        <section className="w-full max-w-lg border border-border bg-card p-6" role="alert">
          <h1 className="flex items-center gap-2 font-semibold">
            <AlertCircle size={18} aria-hidden="true" /> Store editor unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{sourceState.message}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            No editor was opened because the active storefront assignment is unknown.
          </p>
          <Button className="mt-5" variant="outline" onClick={() => setReloadVersion((value) => value + 1)}>
            Try again
          </Button>
        </section>
      </div>
    );
  }
  if (sourceState.status === "adaptive") {
    return (
      <AdaptiveStoreEditor
        key={`${sourceState.source.installationId}:${sourceState.source.sourceRevision}`}
        source={sourceState.source}
        storeName={currentStore?.name ?? "Store"}
        canEdit={hasCapability("theme.edit")}
        canPublish={hasCapability("theme.publish")}
        gateway={gateway}
      />
    );
  }
  const controller = upgradeController ?? getBrowserUpgradeController();
  return (
    <LegacyStoreEditor
      storeId={currentStore!.id}
      headerActions={(
        <LegacyAdaptiveStoreKitUpgradeEntry
          merchant={{
            storeId: currentStore!.id,
            storeName: currentStore!.name,
            storeHandle: currentStore!.handle,
            locale: currentStore!.locale,
            currency: currentStore!.currency,
            businessName: bootstrap?.profile.businessName ?? null,
          }}
          canEdit={hasCapability("theme.edit")}
          controller={controller}
          onStaged={openStagedAdaptiveSource}
        />
      )}
    />
  );
};

export default MyStore;
