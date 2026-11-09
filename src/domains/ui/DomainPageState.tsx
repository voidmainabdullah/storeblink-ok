import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mapDomainError } from "../domain.errors";

export const DomainLoading = () => (
  <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
    <Loader2 className="mr-2 animate-spin" size={18} /> Loading domain status...
  </div>
);

export const DomainLoadError = ({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) => {
  const normalized = mapDomainError(error);
  return (
    <div role="alert" className="border border-destructive/30 bg-destructive/5 p-5">
      <div className="flex gap-3">
        <AlertCircle className="mt-0.5 shrink-0 text-destructive" size={18} />
        <div>
          <h2 className="font-semibold">Domains could not be loaded</h2>
          <p className="mt-1 text-sm text-muted-foreground">{normalized.message}</p>
          <Button className="mt-4" variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
};
