import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Globe2,
  RefreshCw,
  SearchCheck,
  ServerCog,
  ShieldCheck,
  Store,
  Workflow,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  platformAdminQueryKeys,
  platformAdminService,
  type PlatformDomainOverview,
} from "@/platform/admin";

type MetricProps = Readonly<{
  label: string;
  value: number;
  icon: typeof Globe2;
}>;

const Metric = ({ label, value, icon: Icon }: MetricProps) => (
  <div className="border bg-background p-4">
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Icon size={16} className="text-muted-foreground" aria-hidden="true" />
    </div>
    <p className="mt-3 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
  </div>
);

const roleLabel = (role: PlatformDomainOverview["staffRole"]) => role
  .split("_")
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(" ");

const statusClass = (status: string) => status === "active"
  ? "text-emerald-700"
  : status === "failed" || status === "action_required"
    ? "text-destructive"
    : "text-amber-700";

const MainAdmin = () => {
  const auth = useAuth();
  const overview = useQuery({
    queryKey: platformAdminQueryKeys.domainOverview,
    queryFn: () => platformAdminService.getDomainOverview(),
    retry: 1,
    staleTime: 15_000,
  });

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <header className="border-b bg-background">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center bg-foreground text-background">
              <ShieldCheck size={18} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">StoreBlink Main Admin</h1>
              <p className="truncate text-xs text-muted-foreground">{auth.user?.email}</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard"><ArrowLeft className="mr-2" size={14} />Back to dashboard</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Domain operations</p>
            <h2 className="mt-1 text-2xl font-semibold">Platform overview</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cross-store DNS, SSL, registrar, and indexing health from protected platform projections.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void overview.refetch()}
            disabled={overview.isFetching}
          >
            <RefreshCw className={overview.isFetching ? "mr-2 animate-spin" : "mr-2"} size={14} />
            Refresh
          </Button>
        </div>

        {overview.isPending ? (
          <div className="mt-8 border bg-background p-8 text-sm text-muted-foreground">
            Loading platform operations...
          </div>
        ) : overview.error || !overview.data ? (
          <div role="alert" className="mt-8 border border-destructive/30 bg-background p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 text-destructive" size={18} aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold">Platform overview unavailable</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {overview.error instanceof Error ? overview.error.message : "The protected projection could not be loaded."}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-y bg-background px-4 py-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{roleLabel(overview.data.staffRole)}</span>
              <span>Generated {new Date(overview.data.generatedAt).toLocaleString()}</span>
              <span className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 size={14} />AAL2 verified</span>
            </div>

            <section aria-labelledby="platform-health-heading" className="mt-8">
              <h3 id="platform-health-heading" className="mb-3 text-sm font-semibold">Platform health</h3>
              <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Stores" value={overview.data.counts.stores} icon={Store} />
                <Metric label="Connected domains" value={overview.data.counts.domains} icon={Globe2} />
                <Metric label="Active domains" value={overview.data.counts.activeDomains} icon={CheckCircle2} />
                <Metric label="Action required" value={overview.data.counts.actionRequiredDomains} icon={AlertTriangle} />
                <Metric label="SSL pending" value={overview.data.counts.pendingSslDomains} icon={ShieldCheck} />
                <Metric label="DNS verification pending" value={overview.data.counts.pendingVerifications} icon={SearchCheck} />
                <Metric label="Runnable jobs" value={overview.data.counts.queuedJobs} icon={Workflow} />
                <Metric label="Dead jobs" value={overview.data.counts.failedJobs} icon={ServerCog} />
              </div>
            </section>

            <section aria-labelledby="provider-work-heading" className="mt-8">
              <h3 id="provider-work-heading" className="mb-3 text-sm font-semibold">Provider work</h3>
              <div className="grid gap-px bg-border sm:grid-cols-3">
                <Metric label="Pending purchases" value={overview.data.counts.pendingPurchases} icon={Clock3} />
                <Metric label="Active transfers" value={overview.data.counts.activeTransfers} icon={RefreshCw} />
                <Metric label="Google accounts" value={overview.data.counts.connectedGoogleAccounts} icon={SearchCheck} />
              </div>
            </section>

            <section aria-labelledby="recent-domains-heading" className="mt-8">
              <h3 id="recent-domains-heading" className="mb-3 text-sm font-semibold">Recent domains</h3>
              <div className="overflow-x-auto border bg-background">
                {overview.data.recentDomains.length ? (
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Domain</th>
                        <th className="px-4 py-3 font-medium">Store</th>
                        <th className="px-4 py-3 font-medium">State</th>
                        <th className="px-4 py-3 font-medium">DNS</th>
                        <th className="px-4 py-3 font-medium">SSL</th>
                        <th className="px-4 py-3 font-medium">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {overview.data.recentDomains.map((domain) => (
                        <tr key={domain.id}>
                          <td className="px-4 py-3 font-medium">{domain.hostname}</td>
                          <td className="px-4 py-3 text-muted-foreground">{domain.storeName}</td>
                          <td className={`px-4 py-3 font-medium ${statusClass(domain.status)}`}>{domain.status}</td>
                          <td className="px-4 py-3 text-muted-foreground">{domain.dnsStatus}</td>
                          <td className="px-4 py-3 text-muted-foreground">{domain.sslStatus}</td>
                          <td className="px-4 py-3 text-muted-foreground">{new Date(domain.updatedAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-8 text-center">
                    <Globe2 className="mx-auto text-muted-foreground" size={22} aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium">No domain records</p>
                    <p className="mt-1 text-xs text-muted-foreground">The shared domain system is currently in a clean state.</p>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default MainAdmin;
