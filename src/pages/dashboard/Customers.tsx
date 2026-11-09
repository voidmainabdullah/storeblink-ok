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
import { Plus, Users, Trash2, Mail, Phone } from "lucide-react";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional(),
});

const Customers = () => {
  const { user, currentStore, hasCapability } = useAuth();
  const { toast } = useToast();
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const canManage = hasCapability("orders.manage");

  const load = async () => {
    if (!currentStore) return;
    const { data } = await supabase
      .from("customers")
      .select("id, name, email, phone, created_at")
      .eq("store_id", currentStore.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setList(data ?? []);
  };
  useEffect(() => { void load(); }, [currentStore?.id]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast({ title: "Invalid", description: parsed.error.issues[0].message, variant: "destructive" }); return; }
    if (!user || !currentStore || !canManage) return;
    const { error } = await supabase.from("customers").insert({
      user_id: user.id,
      store_id: currentStore.id,
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Customer added" });
    setForm({ name: "", email: "", phone: "" });
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!currentStore || !canManage) return;
    await supabase.from("customers").delete().eq("store_id", currentStore.id).eq("id", id);
    void load();
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Customers</h1>
          <p className="text-muted-foreground mt-1">Build your customer directory.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button disabled={!canManage}><Plus size={16} className="mr-1" /> New customer</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add a customer</DialogTitle></DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={30} /></div>
              <Button type="submit" className="w-full">Save customer</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {list.length === 0 ? (
        <Card className="p-16 text-center text-muted-foreground">
          <Users className="mx-auto mb-3 opacity-30" size={32} />
          No customers yet.
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((c) => (
            <Card key={c.id} className="p-5 hover:shadow-elev transition-smooth group">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-violet text-background grid place-items-center font-bold">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{c.name}</div>
                  {c.email && <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Mail size={11} /> {c.email}</div>}
                  {c.phone && <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Phone size={11} /> {c.phone}</div>}
                </div>
                <button disabled={!canManage} onClick={() => remove(c.id)} className="opacity-0 group-hover:opacity-100 transition-smooth text-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30">
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Customers;
