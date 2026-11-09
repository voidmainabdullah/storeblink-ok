import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ArrowLeft, ShieldX } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { platformAdminQueryKeys, platformAdminService } from "./PlatformAdminService";

export const PlatformAdminGuard = ({ children }: { children: ReactNode }) => {
  const auth = useAuth();
  const userId = auth.user?.id ?? "anonymous";
  const access = useQuery({
    queryKey: platformAdminQueryKeys.access(userId),
    queryFn: () => platformAdminService.getAccess(),
    enabled: Boolean(auth.user),
    retry: false,
    staleTime: 60_000,
  });

  if (access.isPending) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/30 text-sm text-muted-foreground">
        Verifying platform staff access...
      </div>
    );
  }

  if (access.error || !access.data?.active) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/30 p-6">
        <div className="w-full max-w-md border bg-background p-6">
          <ShieldX size={22} aria-hidden="true" />
          <h1 className="mt-4 text-lg font-semibold">Platform staff access required</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This area is restricted to active StoreBlink platform staff. Merchant store roles do not grant access.
          </p>
          <div className="mt-5 flex gap-2">
            <Button asChild variant="outline">
              <Link to="/dashboard"><ArrowLeft className="mr-2" size={15} />Dashboard</Link>
            </Button>
            <Button onClick={() => void access.refetch()}>Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
