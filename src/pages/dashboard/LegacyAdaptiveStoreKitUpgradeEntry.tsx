import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Layers3,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type {
  LegacyAdaptiveMerchantProfile,
  LegacyAdaptiveStoreKitUpgradeController,
  StoreKitInstallationStageResult,
} from "@/adaptive-commerce/installation";
import { artifactHashFor } from "@/adaptive-commerce/compiler";

const ROUTE_LABELS = [
  "Home",
  "Product",
  "Collection",
  "Page",
  "Blog",
  "Cart",
  "Search",
  "404",
] as const;

const storageKey = (storeId: string, storeKitId: string) =>
  `storeblink:adaptive-stage:${storeId}:${storeKitId}`;

const defaultIdempotencyKey = () => {
  const id = globalThis.crypto?.randomUUID?.();
  if (!id) throw new Error("Secure idempotency key generation is unavailable.");
  return `adaptive-upgrade-${id}`;
};

const getOrCreateIdempotencyKey = (
  storeId: string,
  storeKitId: string,
  requestSignature: string,
  createKey: () => string,
): string => {
  const storage = storageKey(storeId, storeKitId);
  const saved = window.localStorage.getItem(storage);
  if (saved) {
    try {
      const record = JSON.parse(saved) as { key?: unknown; requestSignature?: unknown };
      if (
        typeof record.key === "string"
        && record.key.length >= 8
        && record.key.length <= 200
        && record.requestSignature === requestSignature
      ) return record.key;
    } catch {
      // Invalid/stale local data is replaced with a new payload-bound attempt.
    }
  }
  const next = createKey();
  window.localStorage.setItem(storage, JSON.stringify({ key: next, requestSignature }));
  return next;
};

export type LegacyAdaptiveStoreKitUpgradeEntryProps = Readonly<{
  merchant: LegacyAdaptiveMerchantProfile;
  canEdit: boolean;
  controller: LegacyAdaptiveStoreKitUpgradeController;
  onStaged: (result: StoreKitInstallationStageResult) => Promise<void>;
  createIdempotencyKey?: () => string;
}>;

export const LegacyAdaptiveStoreKitUpgradeEntry = ({
  merchant,
  canEdit,
  controller,
  onStaged,
  createIdempotencyKey = defaultIdempotencyKey,
}: LegacyAdaptiveStoreKitUpgradeEntryProps) => {
  const options = useMemo(() => controller.listReleasedOptions(), [controller]);
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? "");
  const [staging, setStaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = options.find((option) => option.id === selectedId) ?? options[0];

  const stageForReview = async () => {
    if (!canEdit || !selected || staging) return;
    setStaging(true);
    setError(null);
    let result: StoreKitInstallationStageResult;
    try {
      const idempotencyKey = getOrCreateIdempotencyKey(
        merchant.storeId,
        selected.id,
        artifactHashFor({
          storeKitId: selected.id,
          storeKitVersion: selected.version,
          merchant,
        }),
        createIdempotencyKey,
      );
      result = await controller.stage({
        merchant,
        storeKitId: selected.id,
        idempotencyKey,
      });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The StoreKit source could not be staged.",
      );
      setStaging(false);
      return;
    }

    try {
      await onStaged(result);
      window.localStorage.removeItem(storageKey(merchant.storeId, selected.id));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? `The source was staged, but the Adaptive editor could not be verified: ${failure.message}`
          : "The source was staged, but the Adaptive editor could not be verified. Retry to replay the same safe staging request.",
      );
      setStaging(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 border-[#5b6472] bg-transparent text-white hover:bg-white/10 hover:text-white"
        >
          <Sparkles size={14} aria-hidden="true" />
          <span className="hidden lg:inline">Adaptive upgrade</span>
          <span className="lg:hidden">Upgrade</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-border p-0 shadow-none">
        <DialogHeader className="border-b border-border px-6 py-5 pr-12">
          <DialogTitle>Stage an Adaptive StoreKit</DialogTitle>
          <DialogDescription className="leading-6">
            Review a released, certified eight-route storefront source before creating a staged draft.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-6 py-1">
          <section className="border border-emerald-600/35 bg-emerald-500/5 p-4" aria-label="Publication safety">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 text-emerald-700" size={20} aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold">Your live storefront stays unchanged</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  This action only stages canonical source for merchant review. It does not compile,
                  accept shadow results, activate a StoreKit, or publish anything.
                </p>
              </div>
            </div>
          </section>

          <section aria-labelledby="upgrade-store-profile">
            <h3 id="upgrade-store-profile" className="text-sm font-semibold">Store profile</h3>
            <dl className="mt-3 grid gap-3 border border-border p-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Store</dt>
                <dd className="mt-1 font-medium">{merchant.storeName}</dd>
                <dd className="text-xs text-muted-foreground">/{merchant.storeHandle}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Business</dt>
                <dd className="mt-1 font-medium">{merchant.businessName || merchant.storeName}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Commerce</dt>
                <dd className="mt-1 font-medium">{merchant.locale} · {merchant.currency}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="released-store-kits">
            <div className="flex items-center justify-between gap-4">
              <h3 id="released-store-kits" className="text-sm font-semibold">Choose a released StoreKit</h3>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <BadgeCheck size={14} aria-hidden="true" /> Exact version pins
              </span>
            </div>
            {options.length ? (
              <RadioGroup
                className="mt-3 grid gap-2 sm:grid-cols-2"
                value={selected?.id}
                onValueChange={(value) => {
                  setSelectedId(value);
                  setError(null);
                }}
                disabled={staging}
                aria-label="Released StoreKit"
              >
                {options.map((option) => (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-start gap-3 border p-4 transition-colors ${
                      selected?.id === option.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <RadioGroupItem className="mt-0.5" value={option.id} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{option.name}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {option.description}
                      </span>
                      <span className="mt-2 block text-xs text-muted-foreground">
                        v{option.version} · {option.presetId ?? "No preset"}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            ) : (
              <p className="mt-3 border border-destructive/40 p-4 text-sm text-destructive" role="alert">
                No complete released StoreKits are available for staging.
              </p>
            )}
          </section>

          <section aria-labelledby="route-coverage">
            <div className="flex items-center gap-2">
              <Layers3 size={16} aria-hidden="true" />
              <h3 id="route-coverage" className="text-sm font-semibold">
                Complete route coverage ({selected?.routeCount ?? 0}/8)
              </h3>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {ROUTE_LABELS.map((route) => (
                <span key={route} className="border border-border bg-muted/30 px-2.5 py-1 text-xs">
                  {route}
                </span>
              ))}
            </div>
          </section>

          {!canEdit ? (
            <p className="border border-amber-600/40 bg-amber-500/5 p-3 text-sm text-amber-800" role="status">
              Theme edit access is required to stage this StoreKit. You can review the available source, but cannot change storefront state.
            </p>
          ) : null}
          {error ? (
            <p className="border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border px-6 py-5">
          <Button
            type="button"
            onClick={() => void stageForReview()}
            disabled={!canEdit || !selected || staging}
          >
            {staging ? <Loader2 className="animate-spin" size={15} aria-hidden="true" /> : null}
            {staging ? "Staging source…" : `Stage ${selected?.name ?? "StoreKit"} for review`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
