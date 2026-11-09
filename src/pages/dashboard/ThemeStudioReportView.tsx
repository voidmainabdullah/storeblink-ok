import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Code2,
  Layers3,
  Palette,
  Route as RouteIcon,
  Store,
} from "lucide-react";
import type {
  ThemeStudioDiagnosticsReport,
  ThemeStudioRuntimeSummary,
} from "@/adaptive-commerce/studio";

type ThemeStudioReportViewProps = Readonly<{
  report: ThemeStudioDiagnosticsReport;
  storeName: string;
}>;

const shortHash = (value: string | null): string => value ? `${value.slice(0, 18)}…` : "Not available";

const runtimeText = (runtime: ThemeStudioRuntimeSummary): { title: string; detail: string } => {
  if (runtime.status === "adaptive") {
    return {
      title: "Adaptive artifact assigned",
      detail: `Publication ${runtime.publicationId ?? "unknown"}, revision ${runtime.publicationRevision ?? "unknown"}`,
    };
  }
  if (runtime.status === "legacy") {
    return { title: "Legacy storefront assigned", detail: "No adaptive artifact is serving this store." };
  }
  if (runtime.status === "missing") {
    return { title: "No runtime assignment found", detail: "The public runtime returned no adaptive publication record." };
  }
  if (runtime.status === "invalid") {
    return { title: "Runtime record is invalid", detail: "The response did not pass the adaptive artifact contract." };
  }
  if (runtime.status === "unavailable") {
    return { title: "Runtime status unavailable", detail: "The public assignment endpoint could not be reached." };
  }
  return { title: "Runtime not checked", detail: "A valid store handle is required for a deployment lookup." };
};

const BoundaryCard = ({
  icon: Icon,
  title,
  audience,
  description,
  action,
}: {
  icon: typeof Store;
  title: string;
  audience: string;
  description: string;
  action?: React.ReactNode;
}) => (
  <article className="border border-border bg-card p-5">
    <div className="flex items-start justify-between gap-4">
      <div className="grid size-9 place-items-center border border-border bg-muted/40">
        <Icon size={18} aria-hidden="true" />
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {audience}
      </span>
    </div>
    <h3 className="mt-5 text-base font-semibold">{title}</h3>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    {action ? <div className="mt-4">{action}</div> : null}
  </article>
);

export const ThemeStudioReportView = ({ report, storeName }: ThemeStudioReportViewProps) => {
  const runtime = runtimeText(report.currentRuntime);
  const compiledRoutes = report.routeCoverage.filter((route) => route.compiled).length;
  const status = report.status === "ready"
    ? { icon: CheckCircle2, title: "Reference compile verified", tone: "border-emerald-300 bg-emerald-50 text-emerald-950" }
    : report.status === "attention"
      ? { icon: CircleAlert, title: "Reference compile completed with warnings", tone: "border-amber-300 bg-amber-50 text-amber-950" }
      : { icon: CircleAlert, title: "Reference compile blocked", tone: "border-red-300 bg-red-50 text-red-950" };
  const StatusIcon = status.icon;

  return (
    <div className="space-y-8">
      <section className={`border p-5 ${status.tone}`} aria-live="polite">
        <div className="flex items-start gap-3">
          <StatusIcon size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">{status.title}</h2>
            <p className="mt-1 text-sm leading-6 opacity-80">
              This result comes from the registered StoreBlink certification catalog and the real storefront compiler. It is not an installation or publish claim for {storeName}.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="studio-boundaries-heading">
        <div className="mb-4">
          <h2 id="studio-boundaries-heading" className="text-lg font-semibold">Choose the right surface</h2>
          <p className="mt-1 text-sm text-muted-foreground">Each surface has one clear job and one owner.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <BoundaryCard
            icon={Store}
            title="Store"
            audience="Merchant"
            description="Edit products, copy, navigation, media, and storefront settings through the active visual editor. Store mode does not expose raw CSS controls."
            action={(
              <Link className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary" to="/dashboard/store">
                Open Store editor <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            )}
          />
          <BoundaryCard
            icon={Palette}
            title="Design"
            audience="Designer"
            description="Use Design mode inside the Store editor for safe layout, structure, brand, and responsive controls. Document changes continue through editor commands and history."
          />
          <BoundaryCard
            icon={Code2}
            title="Theme Studio"
            audience="Developer"
            description="Inspect certified packages, tokens, primitives, route coverage, and compiler diagnostics. This first surface is intentionally read-only; it does not mutate or publish a store."
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Certification summary">
        {[
          ["Routes compiled", `${compiledRoutes}/${report.routeCoverage.length}`],
          ["Design tokens", String(report.tokens.total)],
          ["Certified components", String(report.components.componentCount)],
          ["Responsive primitives", String(report.primitiveKinds.length)],
        ].map(([label, value]) => (
          <div key={label} className="border border-border bg-card p-5">
            <div className="text-2xl font-semibold tracking-tight">{value}</div>
            <div className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="border border-border bg-card" aria-labelledby="packages-heading">
          <div className="border-b border-border p-5">
            <h2 id="packages-heading" className="flex items-center gap-2 font-semibold"><Layers3 size={18} /> Registered packages</h2>
            <p className="mt-1 text-sm text-muted-foreground">Read-only identities from the certification registry.</p>
          </div>
          <div className="divide-y divide-border">
            {report.packages.map((entry) => (
              <div key={`${entry.kind}:${entry.id}`} className="grid gap-2 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <div className="font-medium">{entry.name}</div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">{entry.id}@{entry.version}</div>
                </div>
                <div className="text-left sm:text-right">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{entry.kind}</div>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground" title={entry.integrity}>{shortHash(entry.integrity)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border border-border bg-card p-5" aria-labelledby="runtime-heading">
          <h2 id="runtime-heading" className="font-semibold">Current storefront runtime</h2>
          <p className="mt-1 text-sm text-muted-foreground">Public assignment lookup for {storeName}.</p>
          <div className="mt-6 border-l-2 border-primary pl-4">
            <div className="font-medium">{runtime.title}</div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{runtime.detail}</p>
          </div>
          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <div><dt className="text-muted-foreground">Artifact</dt><dd className="mt-1 font-mono text-xs">{shortHash(report.currentRuntime.artifactHash)}</dd></div>
            <div><dt className="text-muted-foreground">Cohort bucket</dt><dd className="mt-1 font-medium">{report.currentRuntime.cohortBucket ?? "Not available"}</dd></div>
          </dl>
        </section>
      </div>

      <section className="border border-border bg-card" aria-labelledby="routes-heading">
        <div className="border-b border-border p-5">
          <h2 id="routes-heading" className="flex items-center gap-2 font-semibold"><RouteIcon size={18} /> Route coverage</h2>
          <p className="mt-1 text-sm text-muted-foreground">Every required public resource must resolve a versioned blueprint and compiler artifact.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-5 py-3">Route</th><th className="px-5 py-3">Blueprint</th><th className="px-5 py-3">Sections</th><th className="px-5 py-3">Globals</th><th className="px-5 py-3">Compiler</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report.routeCoverage.map((route) => (
                <tr key={route.resourceType}>
                  <td className="px-5 py-3 font-medium">{route.resourceType}</td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{route.blueprintId}@{route.blueprintVersion}</td>
                  <td className="px-5 py-3">{route.sectionCount}</td>
                  <td className="px-5 py-3">{route.globalRegionCount}</td>
                  <td className="px-5 py-3"><span className={route.compiled ? "text-emerald-700" : "text-red-700"}>{route.compiled ? "Compiled" : "Not compiled"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="border border-border bg-card p-5" aria-labelledby="tokens-heading">
          <h2 id="tokens-heading" className="font-semibold">Token tiers</h2>
          <p className="mt-1 text-sm text-muted-foreground">Schema {report.tokens.schemaVersion}; merchant overrides remain a separate governed tier.</p>
          <dl className="mt-5 grid grid-cols-3 divide-x divide-border border-y border-border py-4 text-center">
            <div><dt className="text-xs text-muted-foreground">Primitive</dt><dd className="mt-1 text-xl font-semibold">{report.tokens.primitive}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Semantic</dt><dd className="mt-1 text-xl font-semibold">{report.tokens.semantic}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Component</dt><dd className="mt-1 text-xl font-semibold">{report.tokens.component}</dd></div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">{report.tokens.literalCount} literals · {report.tokens.referenceCount} aliases · {report.tokens.presetCount} presets</p>
        </section>

        <section className="border border-border bg-card p-5" aria-labelledby="primitives-heading">
          <h2 id="primitives-heading" className="font-semibold">Responsive primitive IR</h2>
          <p className="mt-1 text-sm text-muted-foreground">Compiler-owned semantic layout vocabulary; Freeform remains an explicit compatibility island.</p>
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="Responsive primitives">
            {report.primitiveKinds.map((kind) => <li key={kind} className="border border-border bg-muted/30 px-2.5 py-1.5 font-mono text-xs">{kind}</li>)}
          </ul>
        </section>
      </div>

      <section className="border border-border bg-card" aria-labelledby="diagnostics-heading">
        <div className="border-b border-border p-5">
          <h2 id="diagnostics-heading" className="font-semibold">Compiler diagnostics</h2>
          <p className="mt-1 text-sm text-muted-foreground">{report.compiler.completedStages.length} stages completed · compiler {report.compiler.version ?? "not available"}</p>
        </div>
        {report.diagnostics.length ? (
          <ul className="divide-y divide-border">
            {report.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.source}:${diagnostic.code}:${index}`} className="grid gap-2 p-5 sm:grid-cols-[110px_1fr]">
                <span className={diagnostic.severity === "error" ? "text-sm font-semibold text-red-700" : diagnostic.severity === "warning" ? "text-sm font-semibold text-amber-700" : "text-sm font-semibold text-blue-700"}>{diagnostic.severity}</span>
                <div><div className="font-medium">{diagnostic.code}</div><p className="mt-1 text-sm text-muted-foreground">{diagnostic.message}</p>{diagnostic.path ? <div className="mt-2 font-mono text-xs text-muted-foreground">{diagnostic.path}</div> : null}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-5 text-sm text-muted-foreground">No registry or compiler diagnostics were emitted by this verification run.</p>
        )}
      </section>
    </div>
  );
};
