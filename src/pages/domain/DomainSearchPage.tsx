import { CheckCircle2, Search, XCircle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  domainService,
  mapDomainError,
  normalizeDomainSearchName,
  type DomainSearchResult,
} from "@/domains";
import { DomainLoadError, DomainLoading } from "@/domains/ui/DomainPageState";
import {
  useDomainDashboard,
  useDomainDashboardMutation,
} from "@/domains/ui/useDomainDashboard";

const availableTlds = ["com", "net", "org", "store"] as const;

const formatMoney = (amountMinor: number, currency: string) => new Intl.NumberFormat(undefined, {
  style: "currency",
  currency,
}).format(amountMinor / 100);

const DomainSearchPage = () => {
  const { currentStore } = useAuth();
  const { toast } = useToast();
  const dashboard = useDomainDashboard();
  const [name, setName] = useState("");
  const [tlds, setTlds] = useState<string[]>(["com", "store"]);
  const [results, setResults] = useState<readonly DomainSearchResult[]>([]);
  const [requestedQuoteIds, setRequestedQuoteIds] = useState<ReadonlySet<string>>(new Set());
  const search = useMutation({
    mutationFn: async () => {
      if (!currentStore) throw new Error("Store unavailable.");
      return domainService.search(currentStore.id, normalizeDomainSearchName(name), tlds);
    },
    onSuccess: setResults,
    onError: (error) => {
      const normalized = mapDomainError(error);
      toast({ title: "Search failed", description: normalized.message, variant: "destructive" });
    },
  });
  const claim = useDomainDashboardMutation<string>(
    (storeId, hostname) => domainService.claimIncludedDomain(storeId, hostname),
    "Domain registration requested",
  );
  const purchase = useDomainDashboardMutation<string>(
    (storeId, quoteId) => domainService.purchaseDomain(storeId, quoteId),
    "Domain purchase requested",
  );

  if (dashboard.isLoading) return <DomainLoading />;
  if (dashboard.error || !dashboard.data) {
    return <DomainLoadError error={dashboard.error} retry={() => void dashboard.refetch()} />;
  }
  const searchCapability = dashboard.data.capabilities.domainSearch;
  const claimCapability = dashboard.data.capabilities.includedRegistration;
  const paidCapability = dashboard.data.capabilities.paidRegistration;
  const registrationUnavailable = !claimCapability.available || !paidCapability.available;
  const registrationReasons = Array.from(new Set([
    !claimCapability.available ? claimCapability.reason : null,
    !paidCapability.available ? paidCapability.reason : null,
  ].filter((reason): reason is string => Boolean(reason))));

  const toggleTld = (tld: string, enabled: boolean) => {
    setTlds((current) => enabled
      ? Array.from(new Set([...current, tld]))
      : current.filter((value) => value !== tld));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <div className="mb-3 grid h-10 w-10 place-items-center bg-foreground text-background"><Search size={19} /></div>
        <h1 className="text-2xl font-semibold">Find a domain</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Check live registrar availability. Registration actions appear only when the platform account has a supported claim workflow.
        </p>
      </div>

      {!searchCapability.available ? (
        <div role="alert" className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Registrar setup required</p>
          <p className="mt-1">{searchCapability.reason}</p>
        </div>
      ) : (
        <form
          className="border bg-background p-5"
          onSubmit={(event) => {
            event.preventDefault();
            search.mutate();
          }}
        >
          <Label htmlFor="domain-search">Store or brand name</Label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input id="domain-search" value={name} onChange={(event) => setName(event.target.value)} placeholder="storeblink" />
            <Button type="submit" disabled={search.isPending || !name.trim() || !tlds.length}>
              {search.isPending ? "Searching..." : "Search"}
            </Button>
          </div>
          <fieldset className="mt-4">
            <legend className="text-xs font-medium text-muted-foreground">Extensions</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {availableTlds.map((tld) => (
                <label key={tld} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={tlds.includes(tld)} onCheckedChange={(checked) => toggleTld(tld, checked === true)} />
                  .{tld}
                </label>
              ))}
            </div>
          </fieldset>
        </form>
      )}

      {results.length ? (
        <section aria-labelledby="domain-results-heading">
          <h2 id="domain-results-heading" className="mb-3 text-sm font-semibold">Availability</h2>
          <div className="divide-y border bg-background">
            {results.map((result, index) => (
              <div key={`${result.domain ?? "unknown"}-${index}`} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{result.domain ?? "Unavailable"}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {result.available
                      ? <><CheckCircle2 className="text-emerald-600" size={14} /> Available</>
                      : <><XCircle size={14} /> Not available</>}
                    {result.restriction ? ` - ${result.restriction}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {result.available && result.domain && claimCapability.available ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button size="sm" variant="outline">Use included domain</Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Register {result.domain}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This uses an included-domain claim from the configured registrar account. StoreBlink will then configure DNS and SSL automatically.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => claim.mutate(result.domain!)}>Confirm registration</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                  {result.available && result.domain && paidCapability.available && result.quote ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          disabled={purchase.isPending || requestedQuoteIds.has(result.quote.id)}
                        >
                          {requestedQuoteIds.has(result.quote.id)
                            ? "Purchase requested"
                            : `Buy for ${formatMoney(result.quote.amountMinor, result.quote.currency)}`}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Buy {result.domain}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Confirm a {result.quote.period}-{result.quote.periodUnit} registration for {formatMoney(result.quote.amountMinor, result.quote.currency)}.
                            {result.quote.renewalAmountMinor !== result.quote.amountMinor
                              ? ` The current renewal catalog price is ${formatMoney(result.quote.renewalAmountMinor, result.quote.currency)}.`
                              : ""}
                            {" "}The server will recheck availability and price before charging the configured platform registrar account.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => purchase.mutate(result.quote!.id, {
                              onSuccess: () => setRequestedQuoteIds((current) => new Set(current).add(result.quote!.id)),
                            })}
                          >
                            Confirm purchase
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                  {result.available && paidCapability.available && !result.quote && result.quoteUnavailableReason ? (
                    <span className="max-w-64 text-right text-xs text-muted-foreground">
                      {result.quoteUnavailableReason}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {searchCapability.available && registrationUnavailable ? (
        <section className="border bg-background p-5" aria-labelledby="registration-capability-heading">
          <h2 id="registration-capability-heading" className="text-sm font-semibold">Registration options</h2>
          {(registrationReasons.length
            ? registrationReasons
            : ["Registration actions are not enabled for this registrar account."]
          ).map((reason) => (
            <p key={reason} className="mt-2 text-sm text-muted-foreground">{reason}</p>
          ))}
        </section>
      ) : null}
    </div>
  );
};

export default DomainSearchPage;
