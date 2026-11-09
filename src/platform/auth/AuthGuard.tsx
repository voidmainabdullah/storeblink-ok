import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AuthPlatformError } from "./auth.errors";
import type { StoreCapability } from "./auth.types";
import { useAuth } from "./AuthProvider";

export type AuthGuardProps = {
  children: ReactNode;
  capabilities?: readonly StoreCapability[];
  requireStore?: boolean;
  requireAal2?: boolean;
};

const GuardFallback = () => (
  <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
    Loading account...
  </div>
);

export const AuthGuard = ({
  children,
  capabilities = [],
  requireStore = false,
  requireAal2 = false,
}: AuthGuardProps) => {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <GuardFallback />;
  if (!auth.user) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  if (requireAal2 && auth.assuranceLevel !== "aal2") {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth/mfa?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  const missingCapability = capabilities.find((capability) => !auth.hasCapability(capability));
  const requiresStoreAuthorization = requireStore || capabilities.length > 0;
  const denied =
    (requireStore && !auth.currentStore) ||
    Boolean(missingCapability) ||
    (requiresStoreAuthorization && auth.error instanceof AuthPlatformError);
  if (denied) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <h1 className="text-lg font-semibold">Store access unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {auth.error?.message ?? "Your account does not have permission for this action."}
          </p>
          <div className="mt-5 flex gap-2">
            <Button onClick={() => void auth.refreshAuthorization()}>Retry</Button>
            <Button variant="outline" onClick={() => void auth.signOut()}>Sign out</Button>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
};
