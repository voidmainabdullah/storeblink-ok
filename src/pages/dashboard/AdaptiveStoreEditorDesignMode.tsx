import { LockKeyhole } from "lucide-react";
import {
  sectionControlSemanticPath,
  type StorefrontResourceType,
} from "@/adaptive-commerce/contracts";
import {
  certifiedSectionsForRoute,
  createSemanticValueCommand,
  type AdaptiveAuthoringCommand,
  type AdaptiveAuthoringProjection,
  type AdaptiveAuthoringSource,
} from "@/adaptive-commerce/authoring";

export const AdaptiveStoreEditorDesignMode = ({
  source,
  projection,
  route,
  structuralControlsReady,
  editable,
  dispatch,
}: Readonly<{
  source: AdaptiveAuthoringSource;
  projection: AdaptiveAuthoringProjection;
  route: StorefrontResourceType;
  structuralControlsReady: boolean;
  editable: boolean;
  dispatch: (command: AdaptiveAuthoringCommand) => void;
}>) => {
  const sections = certifiedSectionsForRoute(source.catalog, route);
  return (
    <div className="space-y-5">
      <div className="border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole size={15} /> Certified design boundary</div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Variants come from the installed ComponentLibrary. Slots and responsive layout policies are visible for understanding, but raw nodes and CSS are never exposed.
        </p>
      </div>
      {!structuralControlsReady ? (
        <p className="border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
          Variant choices require the canonical section-control migration for this source.
        </p>
      ) : null}
      {sections.map((section) => {
        const variantPath = sectionControlSemanticPath(section.reference.path, "variant");
        const selected = String(
          projection.effectiveDocument.values[variantPath] ?? section.reference.variantId,
        );
        const selectedIsCertified = section.variants.some((variant) => variant.id === selected);
        return (
          <section key={section.reference.path} className="border border-border bg-background p-4" aria-labelledby={`section-policy-${section.reference.path}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id={`section-policy-${section.reference.path}`} className="text-sm font-semibold">{section.componentName}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{section.reference.path}</p>
              </div>
              <span className="border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground">Certified</span>
            </div>
            <label htmlFor={`variant-${section.reference.path}`} className="mt-4 block text-sm font-medium">Layout choice</label>
            <select
              id={`variant-${section.reference.path}`}
              value={selected}
              disabled={!editable || !structuralControlsReady || !section.allowVariantChange || !selectedIsCertified}
              onChange={(event) => dispatch(createSemanticValueCommand({
                target: variantPath,
                before: selected,
                after: event.target.value,
                label: `Change ${section.componentName} layout`,
              }))}
              className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
            >
              {!selectedIsCertified ? <option value={selected}>Current unsupported choice (read-only)</option> : null}
              {section.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}
            </select>
            {!section.allowVariantChange ? <p className="mt-2 text-xs text-muted-foreground">Layout is locked by the component policy.</p> : null}
            {!selectedIsCertified ? <p className="mt-2 text-xs text-muted-foreground">The persisted layout is not certified by this component version and remains read-only.</p> : null}
            <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
              <div className="border border-border p-3">
                <dt className="font-semibold text-foreground">Slots</dt>
                <dd className="mt-1 leading-5 text-muted-foreground">{section.slotLabels.join(" · ") || "No merchant slots"}</dd>
                <dd className="mt-1 text-muted-foreground">{section.allowSlotReorder ? "Order declared by component policy" : "Structural order locked"}</dd>
              </div>
              <div className="border border-border p-3">
                <dt className="font-semibold text-foreground">Responsive behavior</dt>
                <dd className="mt-1 leading-5 text-muted-foreground">{section.responsivePolicy}</dd>
                <dd className="mt-1 text-muted-foreground">Compiler-owned; no breakpoint CSS fields</dd>
              </div>
            </dl>
          </section>
        );
      })}
    </div>
  );
};
