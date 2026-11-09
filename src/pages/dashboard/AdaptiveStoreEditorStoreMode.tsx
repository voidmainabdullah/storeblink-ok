import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react";
import {
  routeSectionOrderSemanticPath,
  sectionControlSemanticPath,
  STOREFRONT_RESOURCE_SEMANTIC_PREFIXES,
  type JsonValue,
  type StorefrontResourceType,
} from "@/adaptive-commerce/contracts";
import {
  certifiedSectionsForRoute,
  certifiedPropertyControlsForRoute,
  certifiedTokenChoices,
  createBindingSourceCommand,
  createCollectionReorderCommand,
  createPresetCommand,
  createSemanticValueCommand,
  createTokenCommand,
  type AdaptiveAuthoringCommand,
  type AdaptiveAuthoringProjection,
  type AdaptiveAuthoringSource,
} from "@/adaptive-commerce/authoring";
import { Button } from "@/components/ui/button";

const labelForPath = (path: string): string => {
  const last = path.split(".").at(-1) ?? path;
  return last.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
};

const SemanticTextField = ({
  path,
  label,
  value,
  disabled,
  onCommit,
}: Readonly<{
  path: string;
  label: string;
  value: string;
  disabled: boolean;
  onCommit: (next: string) => void;
}>) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const multiline = value.length > 70 || /description|body|content|note/.test(path);
  const shared = {
    id: `adaptive-field-${path.split(".").join("-")}`,
    value: draft,
    disabled,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(event.target.value.slice(0, 10_000)),
    onBlur: () => { if (draft !== value) onCommit(draft); },
    className: "mt-2 w-full border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
  };
  return (
    <div>
      <label htmlFor={shared.id} className="text-sm font-medium">{label}</label>
      {multiline ? <textarea {...shared} rows={4} /> : <input {...shared} type="text" />}
      <p className="mt-1 text-xs text-muted-foreground">{path}</p>
    </div>
  );
};

export const AdaptiveStoreEditorStoreMode = ({
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
  const prefix = STOREFRONT_RESOURCE_SEMANTIC_PREFIXES[route];
  const propertyControls = certifiedPropertyControlsForRoute(source.catalog, route);
  const fields = propertyControls.flatMap((control) => {
    const value = projection.effectiveDocument.values[control.path];
    const supported = (
      (["string", "rich-text", "color"].includes(control.valueType) && typeof value === "string") ||
      (control.valueType === "number" && typeof value === "number") ||
      (control.valueType === "boolean" && typeof value === "boolean")
    );
    return supported ? [{ ...control, value }] : [];
  });
  const editablePaths = new Set(propertyControls.map((control) => control.path));
  const lockedFieldCount = Object.entries(projection.effectiveDocument.values).filter(([path, value]) =>
    path.startsWith(`${prefix}.`) &&
    !path.includes(".settings.") &&
    !editablePaths.has(path) &&
    (typeof value === "string" || typeof value === "number" || typeof value === "boolean")).length;
  const sections = certifiedSectionsForRoute(source.catalog, route);
  const orderPath = routeSectionOrderSemanticPath(route);
  const order = projection.effectiveDocument.collections[orderPath]?.order ?? [];
  const visibleSectionCount = order.filter((path) => {
    const section = sections.find((entry) => entry.reference.path === path);
    return section && projection.effectiveDocument.values[
      sectionControlSemanticPath(section.reference.path, "visible")
    ] !== false;
  }).length;
  const tokenChoices = useMemo(
    () => certifiedTokenChoices(source.catalog.designPack),
    [source.catalog.designPack],
  );
  const bindings = projection.storeDefinition.commerceBindings.filter((binding) =>
    binding.target.path.startsWith(`${prefix}.`) &&
    (binding.source.kind === "collection" || binding.source.kind === "product"));
  const selectedPreset = projection.storeDefinition.designTokens.presetId;
  const presetIsCertified = selectedPreset === null || source.catalog.designPack.presets.some(
    (preset) => preset.id === selectedPreset,
  );

  const changeValue = (path: string, before: JsonValue, after: JsonValue) => dispatch(
    createSemanticValueCommand({ target: path, before, after, label: `Change ${labelForPath(path)}` }),
  );
  const move = (path: string, direction: -1 | 1) => {
    const index = order.indexOf(path);
    if (index < 0) return;
    const beforeKey = direction < 0 ? order[index - 1] : order[index + 2] ?? null;
    dispatch(createCollectionReorderCommand({
      target: orderPath,
      order,
      key: path,
      beforeKey,
      label: `Move ${labelForPath(path)} ${direction < 0 ? "up" : "down"}`,
    }));
  };

  return (
    <div className="space-y-7">
      <section aria-labelledby="store-mode-content-title">
        <h3 id="store-mode-content-title" className="text-sm font-semibold">Route content</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Merchant-owned copy saved as semantic patches.</p>
        <div className="mt-4 space-y-4">
          {fields.length ? fields.map(({ path, label, value }) => typeof value === "string" ? (
            <SemanticTextField key={path} path={path} label={label} value={value} disabled={!editable} onCommit={(next) => changeValue(path, value, next)} />
          ) : (
            <label key={path} className="flex items-center justify-between gap-3 border border-border p-3 text-sm">
              <span>{label}</span>
              <input
                 type={typeof value === "boolean" ? "checkbox" : "number"}
                 disabled={!editable}
                checked={typeof value === "boolean" ? value : undefined}
                value={typeof value === "number" ? value : undefined}
                onChange={(event) => changeValue(
                  path,
                  value,
                  typeof value === "boolean" ? event.target.checked : Number(event.target.value),
                )}
              />
            </label>
          )) : <p className="border border-dashed border-border p-4 text-sm text-muted-foreground">This route has no merchant-editable content fields yet.</p>}
          {lockedFieldCount ? (
            <p className="border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
              {lockedFieldCount} existing source {lockedFieldCount === 1 ? "value is" : "values are"} compiler-owned or policy-locked and is not exposed as an edit control.
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="store-mode-sections-title">
        <h3 id="store-mode-sections-title" className="text-sm font-semibold">Sections</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Order and visibility use certified section controls; sections themselves are never deleted.</p>
        {!structuralControlsReady ? (
          <p className="mt-3 border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
            This older source needs the canonical section-control migration. Policies remain read-only until then.
          </p>
        ) : null}
        <ol className="mt-4 space-y-2" aria-label="Route section order">
          {order.map((path, index) => {
            const section = sections.find((entry) => entry.reference.path === path);
            if (!section) return null;
            const visiblePath = sectionControlSemanticPath(section.reference.path, "visible");
            const visible = projection.effectiveDocument.values[visiblePath] !== false;
            return (
              <li key={path} className="flex items-center gap-3 border border-border bg-background p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{section.componentName}</p>
                  <p className="truncate text-xs text-muted-foreground">{path}</p>
                </div>
                <Button variant="ghost" size="icon" disabled={!editable || !structuralControlsReady || index === 0} onClick={() => move(path, -1)} aria-label={`Move ${section.componentName} up`}>
                  <ArrowUp size={15} />
                </Button>
                <Button variant="ghost" size="icon" disabled={!editable || !structuralControlsReady || index === order.length - 1} onClick={() => move(path, 1)} aria-label={`Move ${section.componentName} down`}>
                  <ArrowDown size={15} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!editable || !structuralControlsReady || (visible && visibleSectionCount <= 1)}
                  onClick={() => changeValue(visiblePath, visible, !visible)}
                  aria-label={`${visible ? "Hide" : "Show"} ${section.componentName}`}
                >
                  {visible ? <Eye size={15} className="mr-1.5" /> : <EyeOff size={15} className="mr-1.5" />}
                  {visible ? "Shown" : "Hidden"}
                </Button>
              </li>
            );
          })}
        </ol>
        {structuralControlsReady ? (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Every storefront route must keep at least one certified section visible.</p>
        ) : null}
      </section>

      <section aria-labelledby="store-mode-products-title">
        <h3 id="store-mode-products-title" className="text-sm font-semibold">Product sources</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Only selectors on existing commerce bindings can change.</p>
        <div className="mt-4 space-y-3">
          {bindings.length ? bindings.map((binding) => (
            <div key={binding.id}>
              <label htmlFor={`binding-${binding.id}`} className="text-sm font-medium">{labelForPath(binding.id)}</label>
              <select
                id={`binding-${binding.id}`}
                value={binding.source.selector ?? ""}
                disabled={!editable}
                onChange={(event) => dispatch(createBindingSourceCommand({
                  binding,
                  after: { ...binding.source, selector: event.target.value },
                }))}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
              >
                {[...new Set([
                  binding.source.selector ?? "",
                  ...(binding.source.kind === "collection" ? ["featured", "current", "recommendations", "all"] : ["current", "featured"]),
                ])].filter(Boolean).map((selector) => <option key={selector} value={selector}>{labelForPath(selector)}</option>)}
              </select>
            </div>
          )) : <p className="border border-dashed border-border p-4 text-sm text-muted-foreground">Product selection is catalog-managed on this route.</p>}
        </div>
      </section>

      <section aria-labelledby="store-mode-look-title">
        <h3 id="store-mode-look-title" className="text-sm font-semibold">Colors and type</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Choose checked DesignPack values—no raw CSS or generated tokens.</p>
        <label htmlFor="adaptive-design-preset" className="mt-4 block text-sm font-medium">Design preset</label>
        <select
          id="adaptive-design-preset"
          value={selectedPreset ?? ""}
          disabled={!editable || !presetIsCertified}
          onChange={(event) => dispatch(createPresetCommand(
            selectedPreset,
            event.target.value || null,
          ))}
          className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">StoreKit default</option>
          {!presetIsCertified && selectedPreset ? <option value={selectedPreset}>Current unsupported preset (read-only)</option> : null}
          {source.catalog.designPack.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
        </select>
        {!presetIsCertified ? <p className="mt-1 text-xs text-muted-foreground">This persisted preset is outside the released DesignPack and remains read-only.</p> : null}
        <div className="mt-4 space-y-3">
          {tokenChoices.map((choice) => {
            const current = projection.storeDefinition.designTokens.overrides.find((override) => override.address === choice.address)?.value ?? null;
            const currentKey = current ? JSON.stringify(current) : "";
            const currentIsCertified = !current || choice.values.some((value) => JSON.stringify(value) === currentKey);
            return (
              <div key={choice.address}>
                <label htmlFor={`token-${choice.address}`} className="text-sm font-medium">{labelForPath(choice.label)}</label>
                <select
                  id={`token-${choice.address}`}
                  value={currentKey}
                  disabled={!editable || !currentIsCertified}
                  onChange={(event) => dispatch(createTokenCommand({
                    address: choice.address,
                    before: current,
                    after: event.target.value ? JSON.parse(event.target.value) : null,
                    label: `Change ${choice.label}`,
                  }))}
                  className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Follow preset</option>
                  {!currentIsCertified ? <option value={currentKey}>Current custom value (read-only)</option> : null}
                  {choice.values.map((value) => (
                    <option key={JSON.stringify(value)} value={JSON.stringify(value)}>
                      {Array.isArray(value.$value) ? value.$value.join(", ") : String(value.$value)}
                    </option>
                  ))}
                </select>
                {!currentIsCertified ? (
                  <p className="mt-1 text-xs text-muted-foreground">This existing value is outside the installed DesignPack choices and remains read-only.</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
