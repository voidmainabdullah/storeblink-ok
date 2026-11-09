import { ArrowRightLeft, Clock3, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { domainService, normalizeDomainHostname } from "@/domains";
import { DomainLoadError, DomainLoading } from "@/domains/ui/DomainPageState";
import {
  useDomainDashboard,
  useDomainDashboardMutation,
} from "@/domains/ui/useDomainDashboard";

type TransferInput = { hostname: string; authorizationCode: string };
const readText = (value: unknown) => typeof value === "string" ? value : "";

const DomainTransferPage = () => {
  const dashboard = useDomainDashboard();
  const [hostname, setHostname] = useState("");
  const [authorizationCode, setAuthorizationCode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const transfer = useDomainDashboardMutation<TransferInput>(
    (storeId, input) => domainService.initiateIncludedTransfer(
      storeId,
      input.hostname,
      input.authorizationCode,
    ),
    "Domain transfer initiated",
  );

  if (dashboard.isLoading) return <DomainLoading />;
  if (dashboard.error || !dashboard.data) {
    return <DomainLoadError error={dashboard.error} retry={() => void dashboard.refetch()} />;
  }
  const capability = dashboard.data.capabilities.includedTransfer;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const normalized = normalizeDomainHostname(hostname);
      if (authorizationCode.trim().length < 4) throw new Error("Enter a valid EPP authorization code.");
      if (!confirmed) throw new Error("Confirm domain ownership and the transfer approval step.");
      const code = authorizationCode.trim();
      setAuthorizationCode("");
      setValidationError(null);
      transfer.mutate(
        { hostname: normalized, authorizationCode: code },
        { onSuccess: () => { setHostname(""); setConfirmed(false); } },
      );
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "Check the transfer details.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <div className="mb-3 grid h-10 w-10 place-items-center bg-foreground text-background"><ArrowRightLeft size={19} /></div>
        <h1 className="text-2xl font-semibold">Transfer a domain</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          An eligible included transfer can be started here. Your current nameservers are preserved; after registrant approval, add the StoreBlink CNAME at the DNS provider that remains authoritative.
        </p>
      </div>

      {!capability.available ? (
        <div role="alert" className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Transfer workflow unavailable</p>
          <p className="mt-1">{capability.reason}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5 border bg-background p-5">
          <div>
            <Label htmlFor="transfer-domain">Domain name</Label>
            <Input id="transfer-domain" className="mt-2" value={hostname} onChange={(event) => setHostname(event.target.value)} placeholder="example.com" />
          </div>
          <div>
            <Label htmlFor="authorization-code">EPP authorization code</Label>
            <Input
              id="authorization-code"
              className="mt-2"
              type="password"
              autoComplete="off"
              value={authorizationCode}
              onChange={(event) => setAuthorizationCode(event.target.value)}
              maxLength={200}
            />
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <LockKeyhole size={13} /> The code is sent directly to the registrar and is never stored by StoreBlink.
            </p>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} />
            <span>I own this domain and understand that the registrant must approve the transfer email and that I will add the StoreBlink CNAME at my DNS provider.</span>
          </label>
          {validationError ? <p role="alert" className="text-sm text-destructive">{validationError}</p> : null}
          <Button type="submit" disabled={transfer.isPending || !hostname || !authorizationCode || !confirmed}>
            {transfer.isPending ? "Starting transfer..." : "Start transfer"}
          </Button>
        </form>
      )}

      {dashboard.data.transferRequests.length ? (
        <section aria-labelledby="transfer-status-heading">
          <h2 id="transfer-status-heading" className="mb-3 text-sm font-semibold">Transfer status</h2>
          <div className="divide-y border bg-background">
            {dashboard.data.transferRequests.map((request, index) => (
              <div key={readText(request.id) || index} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-sm font-semibold">{readText(request.hostname)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {readText(request.status).replace(/_/g, " ")}
                  </p>
                </div>
                <Clock3 className="text-muted-foreground" size={17} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default DomainTransferPage;
