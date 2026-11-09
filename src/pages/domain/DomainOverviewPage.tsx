import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Globe2,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Waypoints,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DomainLoadError, DomainLoading } from "@/domains/ui/DomainPageState";
import { DomainStatusBadge } from "@/domains/ui/DomainStatusBadge";
import {
  useDomainDashboard,
  useDomainDashboardMutation,
} from "@/domains/ui/useDomainDashboard";
import { domainService } from "@/domains";

const connectionOptions = [
  {
    to: "/domain/connect/existing",
    label: "Connect a domain you own",
    detail: "Point one CNAME record and StoreBlink handles SSL.",
    icon: Waypoints,
  },
  {
    to: "/domain/connect/search",
    label: "Find a new domain",
    detail: "Search registrar availability without leaving StoreBlink.",
    icon: Search,
  },
  {
    to: "/domain/connect/transfer",
    label: "Transfer a domain",
    detail: "Move an eligible domain using its EPP authorization code.",
    icon: ShoppingBag,
  },
];

const StateRow = ({
  label,
  value,
  complete,
}: {
  label: string;
  value: string;
  complete: boolean;
}) => (
  <div className="flex items-center justify-between gap-4 border-t py-3 first:border-t-0">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="flex items-center gap-2 text-right text-sm font-medium">
      {complete
        ? <CheckCircle2 className="text-emerald-600" size={15} />
        : <CircleAlert className="text-amber-600" size={15} />}
      {value}
    </span>
  </div>
);

const DomainOverviewPage = () => {
  const dashboard = useDomainDashboard();
  const setPrimary = useDomainDashboardMutation<string>(
    (storeId, domainId) => domainService.setPrimary(storeId, domainId),
    "Primary domain updated",
  );
  const retry = useDomainDashboardMutation<string>(
    (storeId, domainId) => domainService.retry(storeId, domainId),
    "Domain verification queued",
  );
  const disconnect = useDomainDashboardMutation<string>(
    (storeId, domainId) => domainService.disconnect(storeId, domainId),
    "Domain disconnected",
  );

  if (dashboard.isLoading) return <DomainLoading />;
  if (dashboard.error || !dashboard.data) {
    return <DomainLoadError error={dashboard.error} retry={() => void dashboard.refetch()} />;
  }

  const primary = dashboard.data.domains.find((domain) => domain.is_primary) ??
    dashboard.data.domains.find((domain) => domain.status !== "disabled");
  const googleStatus = String(dashboard.data.google.status ?? "disconnected");
  const sitemap = primary
    ? dashboard.data.sitemapSubmissions.find((entry) => entry.domain_id === primary.id)
    : undefined;
  const sitemapReady = primary
    ? ["sitemap_ready", "sitemap_submitted", "monitoring"].includes(primary.seo_status)
    : false;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Domains</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage storefront addresses, SSL, and search discovery.
          </p>
        </div>
        <Button asChild><Link to="/domain/connect/existing">Connect domain</Link></Button>
      </div>

      {primary ? (
        <section aria-labelledby="primary-domain-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="primary-domain-heading" className="text-sm font-semibold">Primary domain</h2>
            <DomainStatusBadge status={primary.status} />
          </div>
          <div className="border bg-background">
            <div className="flex items-center justify-between gap-4 p-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center bg-muted"><Globe2 size={19} /></div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{primary.hostname}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {primary.is_primary ? "Canonical storefront address" : "Waiting to become active"}
                  </p>
                </div>
              </div>
              {primary.status === "active" ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={`https://${primary.hostname}`} target="_blank" rel="noreferrer">View store</a>
                </Button>
              ) : null}
            </div>
            <div className="border-t px-5">
              <StateRow label="DNS" value={primary.dns_status === "active" ? "Connected" : "Pending"} complete={primary.dns_status === "active"} />
              <StateRow label="SSL" value={primary.ssl_status === "active" ? "Secure" : "Issuing certificate"} complete={primary.ssl_status === "active"} />
              <StateRow label="Google Search" value={googleStatus === "connected" ? "Connected" : "Not connected"} complete={googleStatus === "connected"} />
              <StateRow
                label="Sitemap"
                value={sitemap?.status === "submitted" ? "Submitted" : sitemapReady ? "Available" : "Pending"}
                complete={sitemap?.status === "submitted" || sitemapReady}
              />
            </div>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="connected-domains-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="connected-domains-heading" className="text-sm font-semibold">Connected domains</h2>
          <Button variant="ghost" size="sm" onClick={() => void dashboard.refetch()} disabled={dashboard.isFetching}>
            <RefreshCw className={dashboard.isFetching ? "mr-2 animate-spin" : "mr-2"} size={14} />
            Refresh
          </Button>
        </div>
        <div className="divide-y border bg-background">
          {dashboard.data.domains.length ? dashboard.data.domains.map((domain) => (
            <div key={domain.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold">{domain.hostname}</span>
                  {domain.is_primary ? <span className="bg-muted px-1.5 py-0.5 text-[10px] font-medium">PRIMARY</span> : null}
                </div>
                <div className="mt-1"><DomainStatusBadge status={domain.status} /></div>
                {domain.failure_message ? <p className="mt-1 text-xs text-destructive">{domain.failure_message}</p> : null}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Actions for ${domain.hostname}`}>
                    <MoreHorizontal size={17} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!domain.is_primary && domain.status === "active" ? (
                    <DropdownMenuItem onSelect={() => setPrimary.mutate(domain.id)}>Set as primary</DropdownMenuItem>
                  ) : null}
                  {domain.status === "failed" || domain.status === "action_required" ? (
                    <DropdownMenuItem onSelect={() => retry.mutate(domain.id)}>Retry verification</DropdownMenuItem>
                  ) : null}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem onSelect={(event) => event.preventDefault()} className="text-destructive">
                        <Trash2 className="mr-2" size={14} /> Disconnect
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect {domain.hostname}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          StoreBlink will stop serving and renewing SSL for this address. Your domain registration is not cancelled.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => disconnect.mutate(domain.id)}>Disconnect</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )) : (
            <div className="p-8 text-center text-sm text-muted-foreground">No custom domains connected.</div>
          )}
        </div>
      </section>

      <section aria-labelledby="connection-options-heading">
        <h2 id="connection-options-heading" className="mb-3 text-sm font-semibold">Add another domain</h2>
        <div className="divide-y border bg-background">
          {connectionOptions.map((option) => (
            <Link key={option.to} to={option.to} className="flex items-center gap-4 p-4 hover:bg-muted/60">
              <option.icon className="shrink-0 text-muted-foreground" size={18} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{option.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{option.detail}</p>
              </div>
              <ArrowRight className="shrink-0 text-muted-foreground" size={16} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};

export default DomainOverviewPage;
