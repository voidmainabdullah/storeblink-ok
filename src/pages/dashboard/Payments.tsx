import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, CreditCard } from "lucide-react";

const schema = z.object({
  amount: z.string().refine((v) => parseFloat(v) > 0, "Amount must be > 0"),
  customer_name: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).optional(),
  method: z.enum(["card", "cash", "tap", "invoice"]),
});

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const Payments = () => {
  const { user, currentStore } = useAuth();
  const { toast } = useToast();
  const [payments, setPayments] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amount: "", customer_name: "", note: "", method: "card" });

  const load = async () => {
    if (!currentStore) return;
    const { data } = await supabase
      .from("payments")
      .select("id, amount_cents, customer_name, method, note, status, created_at")
      .eq("store_id", currentStore.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setPayments(data ?? []);
  };
  useEffect(() => { void load(); }, [currentStore?.id]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast({ title: "Invalid", description: parsed.error.issues[0].message, variant: "destructive" }); return; }
    if (!user || !currentStore) return;
    const { error } = await supabase.from("payments").insert({
      user_id: user.id,
      store_id: currentStore.id,
      amount_cents: Math.round(parseFloat(form.amount) * 100),
      method: form.method,
      customer_name: form.customer_name || null,
      note: form.note || null,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Payment recorded", description: `${fmt(Math.round(parseFloat(form.amount)*100))} captured.` });
    setForm({ amount: "", customer_name: "", note: "", method: "card" });
    setOpen(false);
    load();
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Payments</h1>
          <p className="text-muted-foreground mt-1">Track every transaction.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus size={16} className="mr-1" /> New payment</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record a payment</DialogTitle></DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label>Amount (USD)</Label>
                <Input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              </div>
              <div>
                <Label>Customer (optional)</Label>
                <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} maxLength={100} />
              </div>
              <div>
                <Label>Method</Label>
                <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                  <option value="card">Card</option><option value="cash">Cash</option><option value="tap">Tap to Pay</option><option value="invoice">Invoice</option>
                </select>
              </div>
              <div>
                <Label>Note (optional)</Label>
                <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={500} />
              </div>
              <Button type="submit" className="w-full">Record payment</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-hidden">
        {payments.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground">
            <CreditCard className="mx-auto mb-3 opacity-30" size={32} />
            No payments yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-left p-4 font-medium">Date</th>
                <th className="text-left p-4 font-medium">Customer</th>
                <th className="text-left p-4 font-medium">Method</th>
                <th className="text-left p-4 font-medium">Note</th>
                <th className="text-right p-4 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="p-4">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="p-4">{p.customer_name ?? "—"}</td>
                  <td className="p-4 capitalize">{p.method}</td>
                  <td className="p-4 text-muted-foreground">{p.note ?? "—"}</td>
                  <td className="p-4 text-right font-semibold">{fmt(p.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

export default Payments;
