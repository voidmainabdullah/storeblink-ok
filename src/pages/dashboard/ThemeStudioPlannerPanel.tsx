import { useState } from "react";
import { CheckCircle2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  planAdaptiveStorefront,
  type AdaptivePlannerProposal,
} from "@/adaptive-commerce/ai";

export type ThemeStudioPlannerPanelProps = Readonly<{
  storeId: string;
  planner?: typeof planAdaptiveStorefront;
}>;

export const ThemeStudioPlannerPanel = ({
  storeId,
  planner = planAdaptiveStorefront,
}: ThemeStudioPlannerPanelProps) => {
  const [intent, setIntent] = useState("");
  const [proposal, setProposal] = useState<AdaptivePlannerProposal | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createProposal = async () => {
    setPending(true);
    setError(null);
    setProposal(null);
    try {
      setProposal(await planner({ storeId, intent }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Adaptive planning could not create a safe proposal.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="border border-border bg-card" aria-labelledby="adaptive-planner-title">
      <div className="grid gap-5 border-b border-border p-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles size={16} aria-hidden="true" />
            <h2 id="adaptive-planner-title">Certified storefront proposal</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Describe the storefront you want. The planner can select only released StoreKits, checked presets, and certified variants. It cannot generate CSS or publish changes.
          </p>
        </div>
        <Button onClick={() => void createProposal()} disabled={pending || intent.trim().length < 3}>
          {pending ? "Validating proposal…" : "Create proposal"}
        </Button>
      </div>
      <div className="p-6">
        <label htmlFor="theme-studio-intent" className="text-sm font-medium">Store brief</label>
        <textarea
          id="theme-studio-intent"
          value={intent}
          onChange={(event) => setIntent(event.target.value.slice(0, 2_000))}
          rows={4}
          className="mt-2 w-full resize-y border border-border bg-background p-3 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Example: A calm editorial fashion store with strong photography and a simple purchase flow."
        />
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>Plans are compiler-validated before review.</span><span>{intent.length}/2000</span>
        </div>
        {error ? <p className="mt-4 border border-red-300 bg-red-50 p-3 text-sm text-red-950" role="alert">{error}</p> : null}
        {proposal ? (
          <div className="mt-5 border border-emerald-300 bg-emerald-50/50 p-5" aria-label="Adaptive proposal review">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-950"><CheckCircle2 size={16} /> Ready for review</p>
                <p className="mt-1 text-sm text-emerald-900">No storefront changes have been made.</p>
              </div>
              <button type="button" onClick={() => setProposal(null)} aria-label="Dismiss proposal" className="p-1 text-emerald-950"><X size={17} /></button>
            </div>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-emerald-800">StoreKit</dt><dd className="mt-1 font-mono font-semibold">{proposal.plan.storeKit.id}@{proposal.plan.storeKit.version}</dd></div>
              <div><dt className="text-emerald-800">Preset</dt><dd className="mt-1 font-semibold">{proposal.plan.presetId ?? "StoreKit default"}</dd></div>
              <div><dt className="text-emerald-800">Variant choices</dt><dd className="mt-1 font-semibold">{proposal.plan.variantSelections.length}</dd></div>
              <div><dt className="text-emerald-800">Validation attempts</dt><dd className="mt-1 font-semibold">{proposal.audit.attempts}</dd></div>
            </dl>
            <p className="mt-5 border-t border-emerald-200 pt-4 text-xs leading-5 text-emerald-900">
              Installation remains a separate atomic, reversible action and is unavailable until the server compiler and shadow review approve this store.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
};
