import { Check, CircleAlert, CircleDashed, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DomainLoadError, DomainLoading } from "@/domains/ui/DomainPageState";
import { DomainStatusBadge } from "@/domains/ui/DomainStatusBadge";
import { useDomainDashboard } from "@/domains/ui/useDomainDashboard";

const Stage = ({ label, complete, active }: { label: string; complete: boolean; active: boolean }) => (
  <li className="flex items-center gap-3 py-2 text-sm">
    {complete
      ? <span className="grid h-5 w-5 place-items-center bg-emerald-600 text-white"><Check size={13} /></span>
      : active
        ? <CircleDashed className="animate-spin text-amber-600" size={20} />
        : <CircleAlert className="text-muted-foreground" size={20} />}
    <span className={complete || active ? "font-medium" : "text-muted-foreground"}>{label}</span>
  </li>
);

const DomainStatusPage = () => {
  const dashboard = useDomainDashboard();
  if (dashboard.isLoading) return <DomainLoading />;
  if (dashboard.error || !dashboard.data) {
    return <DomainLoadError error={dashboard.error} retry={() => void dashboard.refetch()} />;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Provisioning status</h1>
          <p className="mt-2 text-sm text-muted-foreground">Live provider state for DNS, certificates, and search setup.</p>
        </div>
        <Button variant="outline" onClick={() => void dashboard.refetch()} disabled={dashboard.isFetching}>
          <RefreshCw className={dashboard.isFetching ? "mr-2 animate-spin" : "mr-2"} size={15} /> Refresh
        </Button>
      </div>
      {dashboard.data.purchaseOrders
        .filter((order) => !order.domain_id || order.status === "failed")
        .map((order) => (
          <section key={order.id} className="border bg-background p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div>
                <h2 className="font-semibold">{order.hostname}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {order.purchase_kind === "paid" ? "Paid registration" : "Included registration"}
                  {order.quoted_amount_minor !== null && order.currency
                    ? ` - ${new Intl.NumberFormat(undefined, { style: "currency", currency: order.currency }).format(order.quoted_amount_minor / 100)}`
                    : ""}
                </p>
              </div>
              <span className="bg-muted px-2 py-1 text-xs font-medium uppercase">{order.status.replace("_", " ")}</span>
            </div>
            <ol className="pt-3">
              <Stage label="Purchase confirmed" complete active={false} />
              <Stage label="Registrar order accepted" complete={Boolean(order.provider_status)} active={!order.provider_status && order.status !== "failed"} />
              <Stage label="Domain provisioning" complete={order.status === "active"} active={order.status === "pending_setup"} />
            </ol>
            {order.failure_message ? <p role="alert" className="mt-3 border-t pt-3 text-sm text-destructive">{order.failure_message}</p> : null}
          </section>
        ))}
      {dashboard.data.domains.length ? dashboard.data.domains.map((domain) => {
        const verified = domain.verification_status === "verified";
        const dnsActive = domain.dns_status === "active";
        const sslActive = domain.ssl_status === "active";
        const sitemapReady = ["sitemap_ready", "sitemap_submitted", "monitoring"].includes(domain.seo_status);
        return (
          <section key={domain.id} className="border bg-background p-5">
            <div className="flex items-center justify-between gap-4 border-b pb-4">
              <div>
                <h2 className="font-semibold">{domain.hostname}</h2>
                <p className="mt-1 text-xs text-muted-foreground">Last checked {domain.last_checked_at ? new Date(domain.last_checked_at).toLocaleString() : "not yet"}</p>
              </div>
              <DomainStatusBadge status={domain.status} />
            </div>
            <ol className="pt-3">
              <Stage label="Domain claim created" complete active={false} />
              <Stage label="DNS ownership verified" complete={verified} active={!verified && domain.status !== "failed"} />
              <Stage label="Traffic route active" complete={dnsActive} active={verified && !dnsActive} />
              <Stage label="SSL certificate active" complete={sslActive} active={dnsActive && !sslActive} />
              <Stage label="Canonical and sitemap ready" complete={sitemapReady} active={sslActive && !sitemapReady} />
            </ol>
            {domain.failure_message ? <p role="alert" className="mt-3 border-t pt-3 text-sm text-destructive">{domain.failure_message}</p> : null}
          </section>
        );
      }) : (
        <div className="border bg-background p-8 text-center text-sm text-muted-foreground">No domain provisioning jobs yet.</div>
      )}
    </div>
  );
};

export default DomainStatusPage;
