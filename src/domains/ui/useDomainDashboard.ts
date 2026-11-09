import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { domainService } from "../DomainService";
import type { DomainDashboard } from "../domain.types";
import { mapDomainError } from "../domain.errors";

const pendingStatuses = new Set([
  "pending",
  "verification_pending",
  "provisioning",
  "ssl_pending",
]);

export const domainDashboardKey = (storeId: string | undefined) => [
  "domain-dashboard",
  storeId ?? "no-store",
] as const;

export const useDomainDashboard = () => {
  const { currentStore } = useAuth();
  const query = useQuery({
    queryKey: domainDashboardKey(currentStore?.id),
    queryFn: () => domainService.getDashboard(currentStore!.id),
    enabled: Boolean(currentStore?.id),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchInterval: (state) => {
      const dashboard = state.state.data;
      const purchasePending = dashboard?.purchaseOrders.some((order) => (
        ["requested", "submitted", "pending_setup"].includes(order.status)
      ));
      const googleStatus = String(dashboard?.google.status ?? "disconnected");
      const googleProvisioning = googleStatus === "connecting" || (
        googleStatus === "connected" && (
          dashboard?.siteVerifications.some((record) => (
            ["pending", "token_ready"].includes(String(record.status ?? ""))
          )) ||
          dashboard?.searchConsoleProperties.some((record) => (
            String(record.status ?? "") === "pending"
          )) ||
          dashboard?.sitemapSubmissions.some((record) => (
            String(record.status ?? "") === "pending"
          ))
        )
      );
      return dashboard?.domains.some((domain) => pendingStatuses.has(domain.status)) || purchasePending || googleProvisioning
        ? 5_000
        : false;
    },
  });
  return { ...query, store: currentStore };
};

export const useDomainDashboardMutation = <TVariables,>(
  mutationFn: (storeId: string, variables: TVariables) => Promise<DomainDashboard>,
  successMessage: string,
) => {
  const { currentStore } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (variables: TVariables) => {
      if (!currentStore) throw new Error("Store unavailable.");
      return mutationFn(currentStore.id, variables);
    },
    onSuccess: (dashboard) => {
      queryClient.setQueryData(domainDashboardKey(currentStore?.id), dashboard);
      toast({ title: successMessage });
    },
    onError: (error) => {
      const normalized = mapDomainError(error);
      toast({
        title: "Domain operation failed",
        description: normalized.message,
        variant: "destructive",
      });
    },
  });
};
