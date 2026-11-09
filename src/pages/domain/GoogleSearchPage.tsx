import { useMutation } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DomainLoadError, DomainLoading } from "@/domains/ui/DomainPageState";
import {
  domainDashboardKey,
  useDomainDashboard,
  useDomainDashboardMutation,
} from "@/domains/ui/useDomainDashboard";
import { domainService } from "@/domains/DomainService";
import { mapDomainError } from "@/domains/domain.errors";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const statusForDomain = (
  records: readonly Record<string, unknown>[],
  domainId: string | undefined,
): unknown => domainId
  ? records.find((record) => record.domain_id === domainId)?.status
  : undefined;

const statusLabel = (
  status: unknown,
  labels: Readonly<Record<string, string>>,
  fallback = "Waiting",
) => typeof status === "string" ? labels[status] ?? fallback : fallback;

const GoogleSearchPage = () => {
  const dashboard = useDomainDashboard();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const connect = useMutation({
    mutationFn: async () => {
      if (!dashboard.store) throw new Error("Store unavailable.");
      return domainService.beginGoogleConnection(dashboard.store.id);
    },
    onSuccess: ({ authorizationUrl }) => {
      window.location.assign(authorizationUrl);
    },
    onError: (error) => {
      const normalized = mapDomainError(error);
      toast({
        title: "Google connection failed",
        description: normalized.message,
        variant: "destructive",
      });
    },
  });
  const retry = useDomainDashboardMutation<void>(
    (storeId) => domainService.retryGoogleConnection(storeId),
    "Google provisioning queued",
  );
  const disconnect = useDomainDashboardMutation<void>(
    (storeId) => domainService.disconnectGoogle(storeId),
    "Google Search disconnected",
  );

  if (dashboard.isLoading) return <DomainLoading />;
  if (dashboard.error || !dashboard.data) {
    return <DomainLoadError error={dashboard.error} retry={() => void dashboard.refetch()} />;
  }
  const capability = dashboard.data.capabilities.googleSearch;
  const status = String(dashboard.data.google.status ?? "disconnected");
  const accountEmail = typeof dashboard.data.google.google_account_email === "string"
    ? dashboard.data.google.google_account_email
    : null;
  const primary = dashboard.data.domains.find((domain) => domain.is_primary && domain.status === "active");
  const verificationStatus = statusForDomain(dashboard.data.siteVerifications, primary?.id);
  const propertyStatus = statusForDomain(dashboard.data.searchConsoleProperties, primary?.id);
  const sitemapStatus = statusForDomain(dashboard.data.sitemapSubmissions, primary?.id);
  const consentLabel = statusLabel(status, {
    connected: "Granted",
    connecting: "In progress",
    reauthorization_required: "Reconnect required",
    failed: "Failed",
  });
  const verificationLabel = statusLabel(verificationStatus, {
    pending: "Queued",
    token_ready: "Verifying ",
    verified: "Verified",
    failed: "Failed",
  });
  const propertyLabel = statusLabel(propertyStatus, {
    pending: "Queued",
    active: "Active",
    permission_lost: "Action required",
    failed: "Failed",
  });
  const sitemapLabel = statusLabel(sitemapStatus, {
    pending: "Queued",
    submitted: "Submitted",
    failed: "Failed",
  });
  const isConnected = status === "connected";
  const setupComplete = isConnected && verificationStatus === "verified" &&
    propertyStatus === "active" && sitemapStatus === "submitted";
  const needsReconnect = status === "reauthorization_required";
  const canRetry = isConnected && !setupComplete;
  const busy = connect.isPending || retry.isPending || disconnect.isPending;
  const metrics = dashboard.data.searchMetrics.reduce<{ clicks: number; impressions: number }>(
    (total, row) => ({
      clicks: total.clicks + Math.max(0, Number(row.clicks ?? 0)),
      impressions: total.impressions + Math.max(0, Number(row.impressions ?? 0)),
    }),
    { clicks: 0, impressions: 0 },
  );
  const inspected = dashboard.data.urlInspectionResults.length;
  const indexed = dashboard.data.urlInspectionResults.filter((row) => row.verdict === "PASS").length;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <div className="mb-3 grid h-10 w-10 place-items-center bg-foreground text-background"><SearchCheck size={19} /></div>
        <h1 className="text-2xl font-semibold">Google Search</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Connect once. StoreBlink verifies the active storefront, creates its Search Console property,
          submits the sitemap, and keeps search status synchronized automatically.
        </p>
      </div>

      <section className="border bg-background" aria-labelledby="google-status-heading">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <ShieldCheck size={20} />
            <div className="min-w-0">
              <h2 id="google-status-heading" className="text-sm font-semibold">Search Console</h2>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {accountEmail ?? primary?.hostname ?? "Connect and activate a primary domain first"}
              </p>
            </div>
          </div>
          <span className="flex items-center gap-2 text-sm font-medium">
            {setupComplete
              ? <CheckCircle2 className="text-emerald-600" size={16} />
              : <CircleAlert className="text-amber-600" size={16} />}
            {setupComplete ? "Monitoring" : isConnected ? "Verifying.. may take 1 or more hours" : "Not connected yet"}
          </span>
        </div>
        {!capability.available ? (
          <div role="alert" className="border-t bg-amber-50 p-5 text-sm text-amber-950">
            <p className="font-semibold">Google Search setup unavailable</p>
            <p className="mt-1">{capability.reason}</p>
          </div>
        ) : null}
        {capability.available ? (
          <div className="flex flex-wrap gap-2 border-t p-5">
            {(!isConnected || needsReconnect) ? (
              <Button
                onClick={() => connect.mutate()}
                disabled={busy || !primary}
              >
                {connect.isPending ? <Loader2 className="mr-2 animate-spin" size={16} /> : <ShieldCheck className="mr-2" size={16} />}
                {needsReconnect ? "Reconnect Google" : "Connect Google"}
              </Button>
            ) : null}
            {canRetry ? (
              <Button variant="outline" onClick={() => retry.mutate(undefined)} disabled={busy}>
                {retry.isPending ? <Loader2 className="mr-2 animate-spin" size={16} /> : <RefreshCw className="mr-2" size={16} />}
                Retry setup
              </Button>
            ) : null}
            {(isConnected || status === "connecting") ? (
              <Button variant="ghost" onClick={() => disconnect.mutate(undefined)} disabled={busy}>
                {disconnect.isPending ? <Loader2 className="mr-2 animate-spin" size={16} /> : <Unplug className="mr-2" size={16} />}
                Disconnect
              </Button>
            ) : null}
            {!primary ? <p className="w-full text-xs text-muted-foreground">Activate a primary custom domain first.</p> : null}
            {primary && (!isConnected || needsReconnect) ? (
              <p className="w-full text-xs text-muted-foreground">
                Google will show a permission checklist. Keep both Site Verification and Search Console selected.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="google-workflow-heading">
        <h2 id="google-workflow-heading" className="mb-3 text-sm font-semibold">Provisioning workflow</h2>
        <ol className="divide-y border bg-background text-sm">
          <li className="flex items-center justify-between gap-4 p-4"><span>Primary domain active</span><span>{primary ? "Ready" : "Waiting"}</span></li>
          <li className="flex items-center justify-between gap-4 p-4"><span>Merchant Google consent</span><span>{consentLabel}</span></li>
          <li className="flex items-center justify-between gap-4 p-4"><span>Site ownership verification</span><span>{verificationLabel}</span></li>
          <li className="flex items-center justify-between gap-4 p-4"><span>Search Console property</span><span>{propertyLabel}</span></li>
          <li className="flex items-center justify-between gap-4 p-4"><span>Sitemap submission</span><span>{sitemapLabel}</span></li>
        </ol>
      </section>

      {setupComplete ? (
        <section aria-labelledby="search-performance-heading">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 id="search-performance-heading" className="text-sm font-semibold">Search monitoring</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void queryClient.invalidateQueries({ queryKey: domainDashboardKey(dashboard.store?.id) })}
            >
              <RefreshCw className="mr-2" size={14} /> Refresh
            </Button>
          </div>
          <dl className="grid border bg-background sm:grid-cols-3">
            <div className="border-b p-4 sm:border-b-0 sm:border-r"><dt className="text-xs text-muted-foreground">28-day clicks</dt><dd className="mt-1 text-xl font-semibold">{metrics.clicks}</dd></div>
            <div className="border-b p-4 sm:border-b-0 sm:border-r"><dt className="text-xs text-muted-foreground">28-day impressions</dt><dd className="mt-1 text-xl font-semibold">{metrics.impressions}</dd></div>
            <div className="p-4"><dt className="text-xs text-muted-foreground">Indexed checks</dt><dd className="mt-1 text-xl font-semibold">{indexed}/{inspected}</dd></div>
          </dl>
        </section>
      ) : null}
    </div>
  );
};

export default GoogleSearchPage;
