import { CheckCircle2, CircleAlert, Clock3, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DomainStatus } from "../domain.types";

const labels: Record<DomainStatus, string> = {
  pending: "Pending",
  verification_pending: "Waiting for DNS",
  provisioning: "Provisioning",
  ssl_pending: "Securing",
  active: "Active",
  action_required: "Action required",
  failed: "Failed",
  disabled: "Disconnected",
};

export const DomainStatusBadge = ({ status }: { status: DomainStatus }) => {
  const Icon = status === "active"
    ? CheckCircle2
    : status === "failed" || status === "action_required"
      ? CircleAlert
      : status === "disabled"
        ? MinusCircle
        : Clock3;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        status === "active" && "text-emerald-700",
        (status === "failed" || status === "action_required") && "text-destructive",
        status === "disabled" && "text-muted-foreground",
        ["pending", "verification_pending", "provisioning", "ssl_pending"].includes(status) &&
          "text-amber-700",
      )}
    >
      <Icon size={14} />
      {labels[status]}
    </span>
  );
};
