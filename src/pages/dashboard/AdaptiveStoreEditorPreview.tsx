import { useMemo, type CSSProperties } from "react";
import {
  routeSectionOrderSemanticPath,
  sectionControlSemanticPath,
  STOREFRONT_RESOURCE_SEMANTIC_PREFIXES,
  type StorefrontResourceType,
} from "@/adaptive-commerce/contracts";
import { resolveDesignTokens } from "@/adaptive-commerce/tokens";
import type {
  AdaptiveAuthoringProjection,
  AdaptiveAuthoringSource,
} from "@/adaptive-commerce/authoring";

const text = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim() ? value : fallback;

export const AdaptiveStoreEditorPreview = ({
  source,
  projection,
  route,
  storeName,
}: Readonly<{
  source: AdaptiveAuthoringSource;
  projection: AdaptiveAuthoringProjection;
  route: StorefrontResourceType;
  storeName: string;
}>) => {
  const blueprint = source.catalog.blueprints.find((entry) => entry.resourceType === route)!;
  const order = projection.effectiveDocument.collections[routeSectionOrderSemanticPath(route)]?.order
    ?? blueprint.sections.map((section) => section.path);
  const byPath = new Map<string, (typeof blueprint.sections)[number]>(
    blueprint.sections.map((section) => [section.path, section]),
  );
  const sections = order.flatMap((path) => {
    const section = byPath.get(path);
    if (!section) return [];
    const visible = projection.effectiveDocument.values[
      sectionControlSemanticPath(section.path, "visible")
    ];
    return visible === false ? [] : [section];
  });
  const previewStyle = useMemo(() => {
    const selectedPreset = source.catalog.designPack.presets.find(
      (preset) => preset.id === projection.storeDefinition.designTokens.presetId,
    );
    const overrides = new Map(
      [...(selectedPreset?.overrides ?? []), ...projection.storeDefinition.designTokens.overrides]
        .map((override) => [override.address, override] as const),
    );
    const resolved = resolveDesignTokens(source.catalog.designPack.tokens, {
      presetId: projection.storeDefinition.designTokens.presetId,
      overrides: [...overrides.values()],
    });
    const value = (address: string): unknown => resolved.tokens[address]?.value;
    const font = value("semantic:type.body");
    return {
      "--draft-surface": String(value("semantic:color.surface") ?? "#fff"),
      "--draft-muted": String(value("semantic:color.surface-muted") ?? "#f5f5f5"),
      "--draft-text": String(value("semantic:color.text") ?? "#171717"),
      "--draft-border": String(value("semantic:color.border") ?? "#dedede"),
      "--draft-action": String(value("semantic:color.action") ?? "#4338ca"),
      fontFamily: Array.isArray(font) ? font.join(", ") : String(font ?? "inherit"),
    } as CSSProperties;
  }, [projection.storeDefinition.designTokens, source.catalog.designPack]);

  return (
    <section className="flex min-h-0 flex-1 flex-col border border-border bg-muted/30" aria-label="Draft storefront preview">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Structural draft preview</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Local source structure · not pixel-accurate · not published</p>
        </div>
        <span className="border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
          Draft
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4 lg:p-7">
        <div
          className="mx-auto min-h-[640px] max-w-4xl border bg-[var(--draft-surface)] text-[var(--draft-text)]"
          style={previewStyle}
          data-testid="adaptive-draft-canvas"
        >
          <header className="flex items-center justify-between border-b border-[var(--draft-border)] px-6 py-5">
            <strong>{storeName}</strong>
            <nav aria-label="Draft navigation" className="flex gap-5 text-sm">
              <span>Home</span><span>Products</span><span>Cart</span>
            </nav>
          </header>
          <main>
            {sections.map((section, index) => {
              const variant = text(
                projection.effectiveDocument.values[sectionControlSemanticPath(section.path, "variant")],
                section.variantId,
              );
              const heading = text(
                projection.effectiveDocument.values[`${section.path}.heading`],
                text(section.properties.heading, section.componentId.split("-").join(" ")),
              );
              const description = text(
                projection.effectiveDocument.values[`${section.path}.description`],
                "Certified responsive section",
              );
              return (
                <section
                  key={section.path}
                  className={`border-b border-[var(--draft-border)] px-6 py-10 ${index % 2 ? "bg-[var(--draft-muted)]" : ""}`}
                  data-section-path={section.path}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.13em] opacity-60">{variant}</p>
                  <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight">{heading}</h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 opacity-75">{description}</p>
                  {section.bindingIds.length ? (
                    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {[1, 2, 3].map((item) => (
                        <div key={item} className="border border-[var(--draft-border)] bg-[var(--draft-surface)] p-4">
                          <div className="aspect-[4/3] bg-[var(--draft-muted)]" />
                          <div className="mt-3 h-2.5 w-2/3 bg-[var(--draft-border)]" />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
            {!sections.length ? (
              <div className="grid min-h-80 place-items-center p-8 text-center text-sm opacity-70">
                This draft route has no visible sections. Keep at least one section visible before review.
              </div>
            ) : null}
          </main>
          <footer className="border-t border-[var(--draft-border)] px-6 py-8 text-sm opacity-70">
            {storeName} · {STOREFRONT_RESOURCE_SEMANTIC_PREFIXES[route]} route
          </footer>
        </div>
      </div>
    </section>
  );
};
