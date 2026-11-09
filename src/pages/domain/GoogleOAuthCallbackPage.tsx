import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { domainService } from "@/domains/DomainService";
import { mapDomainError } from "@/domains/domain.errors";
import { domainDashboardKey } from "@/domains/ui/useDomainDashboard";
import { useAuth } from "@/hooks/useAuth";

const GoogleOAuthCallbackPage = () => {
  const { currentStore } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (started.current || !currentStore) return;
    started.current = true;
    const providerError = params.get("error");
    const code = params.get("code");
    const state = params.get("state");
    if (providerError) {
      setError(providerError === "access_denied"
        ? "Google access was not granted. You can start the connection again."
        : "Google could not complete authorization.");
      return;
    }
    if (!code || !state) {
      setError("Google returned an incomplete authorization response.");
      return;
    }
    void domainService.completeGoogleConnection(currentStore.id, code, state)
      .then((dashboard) => {
        queryClient.setQueryData(domainDashboardKey(currentStore.id), dashboard);
        setCompleted(true);
        navigate("/domain/connect/google", { replace: true });
      })
      .catch((callbackError) => {
        setError(mapDomainError(callbackError).message);
      });
  }, [currentStore, navigate, params, queryClient]);

  return (
    <div className="mx-auto max-w-lg border bg-background p-6">
      {error ? (
        <div role="alert">
          <CircleAlert className="text-destructive" size={24} />
          <h1 className="mt-4 text-lg font-semibold">Google connection failed</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-5" onClick={() => navigate("/domain/connect/google", { replace: true })}>
            Back to Google Search
          </Button>
        </div>
      ) : completed ? (
        <div aria-live="polite">
          <CheckCircle2 className="text-emerald-600" size={24} />
          <h1 className="mt-4 text-lg font-semibold">Google connected</h1>
          <p className="mt-2 text-sm text-muted-foreground">Automatic storefront verification has started.</p>
        </div>
      ) : (
        <div aria-live="polite">
          <Loader2 className="animate-spin" size={24} />
          <h1 className="mt-4 text-lg font-semibold">Completing Google connection</h1>
          <p className="mt-2 text-sm text-muted-foreground">Keep this page open while StoreBlink secures the authorization.</p>
        </div>
      )}
    </div>
  );
};

export default GoogleOAuthCallbackPage;
