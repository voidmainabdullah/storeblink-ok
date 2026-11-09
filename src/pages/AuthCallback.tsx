import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const safeReturnTo = (value: string | null) =>
  value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";

const AuthCallback = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    if (auth.loading || !auth.user) return;
    const returnTo = safeReturnTo(params.get("returnTo"));
    void auth.listMfaFactors()
      .then((factors) => {
        const needsMfa = auth.assuranceLevel !== "aal2" && factors.some((factor) => factor.status === "verified");
        navigate(needsMfa ? `/auth/mfa?returnTo=${encodeURIComponent(returnTo)}` : returnTo, { replace: true });
      })
      .catch(() => navigate(returnTo, { replace: true }));
  }, [auth, navigate, params]);

  if (auth.loading || auth.user) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Verifying your account...</div>;
  }
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold">Verification link unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">The link may have expired or already been used.</p>
        <Button asChild className="mt-5"><Link to="/auth">Return to sign in</Link></Button>
      </div>
    </div>
  );
};

export default AuthCallback;
