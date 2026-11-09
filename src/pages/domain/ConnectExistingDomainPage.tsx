import { Check, Clipboard, RefreshCw, Waypoints } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { domainService, normalizeDomainHostname } from "@/domains";
import { DomainLoadError, DomainLoading } from "@/domains/ui/DomainPageState";
import { DomainStatusBadge } from "@/domains/ui/DomainStatusBadge";
import {
  useDomainDashboard,
  useDomainDashboardMutation,
} from "@/domains/ui/useDomainDashboard";

const RecordValue = ({ label, value }: { label: string; value: string }) => {
  const { toast } = useToast();
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    toast({ title: `${label} copied` });
  };
  return (
    <div className="grid gap-1.5 border-t py-3 first:border-t-0 sm:grid-cols-[130px_minmax(0,1fr)_36px] sm:items-center">
      <span className="text-xs font-medium uppercase text-muted-foreground">{label}</span>
      <code className="min-w-0 break-all text-sm">{value}</code>
      <Button type="button" variant="ghost" size="icon" onClick={() => void copy()} aria-label={`Copy ${label}`}>
        <Clipboard size={15} />
      </Button>
    </div>
  );
};

const ConnectExistingDomainPage = () => {
  const [hostname, setHostname] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const dashboard = useDomainDashboard();
  const connect = useDomainDashboardMutation<string>(
    (storeId, normalizedHostname) => domainService.connectExisting(storeId, normalizedHostname),
    "Domain connection started",
  );
  const checkConnection = useDomainDashboardMutation<string>(
    (storeId, domainId) => domainService.retry(storeId, domainId),
    "Connection check started",
  );

  if (dashboard.isLoading) return <DomainLoading />;
  if (dashboard.error || !dashboard.data) {
    return <DomainLoadError error={dashboard.error} retry={() => void dashboard.refetch()} />;
  }

  const capability = dashboard.data.capabilities.existingDomain;
  const activeClaim = dashboard.data.domains.find(
    (domain) => domain.status !== "disabled" && domain.verification,
  );
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const normalized = normalizeDomainHostname(hostname);
      setValidationError(null);
      connect.mutate(normalized, { onSuccess: () => setHostname("") });
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "Enter a valid domain name.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <div className="mb-3 grid h-10 w-10 place-items-center bg-foreground text-background"><Waypoints size={19} /></div>
        <h1 className="text-2xl font-semibold">Connect an existing domain</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Keep the domain at your current registrar. Add one CNAME record and StoreBlink will verify it and issue SSL automatically.
        </p>
      </div>

      {!capability.available ? (
        <div role="alert" className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Connection setup required</p>
          <p className="mt-1">{capability.reason}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="border bg-background p-5">
          <Label htmlFor="domain-hostname">Domain name</Label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input
              id="domain-hostname"
              inputMode="url"
              autoComplete="url"
              placeholder="shop.example.com"
              value={hostname}
              onChange={(event) => {
                setHostname(event.target.value);
                setValidationError(null);
              }}
              aria-invalid={Boolean(validationError)}
              aria-describedby={validationError ? "domain-hostname-error" : undefined}
            />
            <Button type="submit" disabled={connect.isPending || !hostname.trim()}>
              {connect.isPending ? "Connecting..." : "Connect domain"}
            </Button>
          </div>
          {validationError ? <p id="domain-hostname-error" className="mt-2 text-sm text-destructive">{validationError}</p> : null}
          <p className="mt-2 text-xs text-muted-foreground">Do not enter a path such as `/products`.</p>
        </form>
      )}

      {activeClaim ? (
        <section aria-labelledby="dns-instructions-heading">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="dns-instructions-heading" className="text-sm font-semibold">DNS record for {activeClaim.hostname}</h2>
              <p className="mt-1 text-xs text-muted-foreground">Add this record at the DNS provider that controls your domain.</p>
            </div>
            <DomainStatusBadge status={activeClaim.status} />
          </div>
          <div className="border bg-background px-4">
            <RecordValue label="Type" value={activeClaim.verification!.record_type} />
            <RecordValue label="Name / host" value={activeClaim.verification!.record_name} />
            <RecordValue label="Points to" value={activeClaim.verification!.record_value} />
            <RecordValue label="TTL" value="Auto (or 300 seconds)" />
          </div>
          <div className="mt-3 space-y-2 border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-950">
            <p><strong>At your DNS provider:</strong> create a CNAME, copy the exact Name and Points to values above, and remove any old A/AAAA/CNAME record for the same hostname.</p>
            <p>If the provider asks for a short host, use only the first label (for example <code>shop</code> for <code>shop.example.com</code>). If it accepts a full name, paste the exact value shown above.</p>
            <p>Cloudflare DNS users: keep this record <strong>DNS only</strong> (grey cloud) while StoreBlink verifies it.</p>
            {activeClaim.hostname.split(".").length === 2 ? (
              <p><strong>Root domain note:</strong> some DNS providers do not allow a CNAME at <code>@</code>. In that case connect <code>www.{activeClaim.hostname}</code> instead, unless your provider supports CNAME flattening/ALIAS.</p>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={() => activeClaim.status === "active"
                ? void dashboard.refetch()
                : checkConnection.mutate(activeClaim.id)}
              disabled={dashboard.isFetching || checkConnection.isPending}
            >
              <RefreshCw className={dashboard.isFetching || checkConnection.isPending ? "mr-2 animate-spin" : "mr-2"} size={15} />
              Check connection
            </Button>
            {activeClaim.status === "active" ? (
              <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
                <Check size={16} /> DNS and SSL are active
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Verification continues automatically. DNS changes can take time to propagate.</span>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default ConnectExistingDomainPage;
