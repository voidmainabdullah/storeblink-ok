import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingBag, Mail, Phone, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
const statusColor: Record<string, string> = {
  pending: "bg-brand-yellow/20 text-foreground",
  confirmed: "bg-brand-sky/20 text-foreground",
  shipped: "bg-brand-violet/20 text-foreground",
  delivered: "bg-brand-mint/20 text-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

const Orders = () => {
  const { currentStore, hasCapability } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const canManage = hasCapability("orders.manage");

  const load = useCallback(async () => {
    if (!currentStore) return;
    const { data: ords } = await supabase
      .from("orders")
      .select("id, customer_name, customer_email, customer_phone, total_cents, status, note, created_at")
      .eq("store_id", currentStore.id)
      .order("created_at", { ascending: false })
      .limit(100);
    const list = ords ?? [];
    setOrders(list);
    if (list.length) {
      const ids = list.map((o) => o.id);
      const { data: lines } = await supabase
        .from("order_items")
        .select("id, order_id, item_name, unit_price_cents, quantity")
        .eq("store_id", currentStore.id)
        .in("order_id", ids);
      const grouped: Record<string, any[]> = {};
      (lines ?? []).forEach((l) => {
        grouped[l.order_id] ??= [];
        grouped[l.order_id].push(l);
      });
      setItems(grouped);
    }
    setLoading(false);
  }, [currentStore]);
  useEffect(() => { void load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    if (!currentStore || !canManage) return;
    const { error } = await supabase
      .from("orders")
      .update({ status })
      .eq("store_id", currentStore.id)
      .eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Status updated" });
    void load();
  };

  if (loading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Orders</h1>
        <p className="text-muted-foreground mt-1">Incoming orders from your storefront.</p>
      </div>

      {orders.length === 0 ? (
        <Card className="p-16 text-center text-muted-foreground">
          <ShoppingBag className="mx-auto mb-3 opacity-30" size={32} />
          No orders yet. Share your store link to start selling.
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <Card key={o.id} className="p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">#{o.id.slice(0, 8)}</span>
                    <Badge className={statusColor[o.status] ?? "bg-muted"}>{o.status}</Badge>
                  </div>
                  <div className="font-semibold text-lg mt-1">{o.customer_name}</div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                    {o.customer_email && <span className="flex items-center gap-1"><Mail size={11} /> {o.customer_email}</span>}
                    {o.customer_phone && <span className="flex items-center gap-1"><Phone size={11} /> {o.customer_phone}</span>}
                    <span className="flex items-center gap-1"><Calendar size={11} /> {new Date(o.created_at).toLocaleString()}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold">{fmt(o.total_cents)}</div>
                  <Select disabled={!canManage} value={o.status} onValueChange={(v) => updateStatus(o.id, v)}>
                    <SelectTrigger className="w-36 mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="border-t border-border mt-4 pt-3 space-y-1.5">
                {(items[o.id] ?? []).map((l) => (
                  <div key={l.id} className="flex justify-between text-sm">
                    <span>{l.item_name} × {l.quantity}</span>
                    <span className="text-muted-foreground">{fmt(l.unit_price_cents * l.quantity)}</span>
                  </div>
                ))}
                {o.note && <div className="text-xs text-muted-foreground italic mt-2">"{o.note}"</div>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Orders;
