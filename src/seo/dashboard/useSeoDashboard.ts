import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { mapDomainError } from "@/domains/domain.errors";
import { seoDashboardService } from "./SeoDashboardService";
import type { SeoDashboard } from "./seo-dashboard.types";

export const seoDashboardKey = (storeId: string | undefined) => [
  "seo-dashboard",
  storeId ?? "no-store",
] as const;

export const useSeoDashboard = () => {
  const { currentStore } = useAuth();
  const query = useQuery({
    queryKey: seoDashboardKey(currentStore?.id),
    queryFn: () => seoDashboardService.getDashboard(currentStore!.id),
    enabled: Boolean(currentStore?.id),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: (state) => state.state.data?.state.dirty ? 15_000 : false,
  });
  return { ...query, store: currentStore };
};

export const useSeoMutation = <TVariables,>(
  mutationFn: (storeId: string, variables: TVariables) => Promise<SeoDashboard>,
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
      queryClient.setQueryData(seoDashboardKey(currentStore?.id), dashboard);
      toast({ title: successMessage });
    },
    onError: (error) => {
      const normalized = mapDomainError(error);
      toast({
        title: "SEO operation failed",
        description: normalized.message,
        variant: "destructive",
      });
    },
  });
};
