import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Package, Trash2, Eye, EyeOff } from "lucide-react";
import { MultiImageUploader } from "@/components/store/MultiImageUploader";
import { coverImage } from "@/components/store/storeUtils";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  price: z.string().refine((v) => parseFloat(v) >= 0, "Invalid price"),
  category: z.string().trim().max(50).optional(),
  stock: z.string().refine((v) => parseInt(v) >= 0, "Invalid stock"),
  description: z.string().trim().max(500).optional(),
  sale_tag: z.string().trim().max(10).optional(),
  original_price: z.string().optional(),
});

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const blank = {
  name: "",
  price: "",
  category: "",
  stock: "0",
  images: [] as string[],
  description: "",
  is_published: true,
  badge: "none" as "none" | "Deal" | "Hot",
  sale_tag: "",
  free_delivery: false,
  original_price: "",
  sale_ends_at: "", // datetime-local string
  visible_categories: [] as string[], // extra category buckets the product appears in
};

const Items = () => {
  const { user, currentStore, hasCapability } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const canEdit = hasCapability("catalog.edit");

  const load = async () => {
    if (!currentStore) {
      setItems([]);
      return;
    }
    const { data, error } = await supabase
      .from("items")
      .select("id, name, price_cents, original_price_cents, category, stock, images, image_url, description, is_published, badge, sale_tag, free_delivery, sale_ends_at, visible_categories, sold_count, created_at")
      .eq("store_id", currentStore.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      toast({ title: "Catalog could not be loaded", description: error.message, variant: "destructive" });
      return;
    }
    setItems(data ?? []);
  };
  useEffect(() => { void load(); }, [currentStore?.id]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast({ title: "Invalid", description: parsed.error.issues[0].message, variant: "destructive" }); return; }
    const priceCents = Math.round(parseFloat(form.price) * 100);
    const originalCents = form.original_price ? Math.round(parseFloat(form.original_price) * 100) : null;
    if (originalCents !== null && originalCents <= priceCents) {
      toast({ title: "Original price must be higher than sale price", variant: "destructive" });
      return;
    }
    if (!user || !currentStore || !canEdit) {
      toast({ title: "You do not have permission to edit this catalog", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("items").insert({
      store_id: currentStore.id,
      user_id: user.id,
      name: form.name,
      price_cents: priceCents,
      original_price_cents: originalCents,
      category: form.category || null,
      stock: parseInt(form.stock),
      images: form.images as any,
      image_url: form.images[0] ?? null, // legacy mirror for back-compat
      description: form.description || null,
      is_published: form.is_published,
      badge: form.badge === "none" ? null : form.badge,
      sale_tag: form.sale_tag || null,
      free_delivery: form.free_delivery,
      sale_ends_at: form.sale_ends_at ? new Date(form.sale_ends_at).toISOString() : null,
      visible_categories: form.visible_categories,
    } as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Item added", description: form.name });
    setForm(blank);
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!currentStore || !canEdit) return;
    const { error } = await supabase.from("items").delete().eq("store_id", currentStore.id).eq("id", id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else void load();
  };

  const togglePublish = async (item: any) => {
    if (!currentStore || !canEdit) return;
    const { error } = await supabase
      .from("items")
      .update({ is_published: !item.is_published })
      .eq("store_id", currentStore.id)
      .eq("id", item.id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else void load();
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Items</h1>
          <p className="text-muted-foreground mt-1">Your product catalog. Toggle to publish on your store.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(blank); }}>
          <DialogTrigger asChild><Button disabled={!canEdit}><Plus size={16} className="mr-1" /> New item</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader><DialogTitle>Add an item</DialogTitle></DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Price (USD)</Label><Input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></div>
                <div>
                  <Label>Original price <span className="text-muted-foreground text-[10px]">(strikethrough)</span></Label>
                  <Input type="number" step="0.01" min="0" placeholder="Optional" value={form.original_price} onChange={(e) => setForm({ ...form, original_price: e.target.value })} />
                </div>
                <div><Label>Stock</Label><Input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required /></div>
              </div>
              <div><Label>Primary category (optional)</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} maxLength={50} placeholder="e.g. Electronics, Headphones" /></div>

              <div className="rounded-lg border border-border p-3 bg-muted/20">
                <Label className="text-xs">Also show this product in <span className="text-muted-foreground font-normal">(comma-separated extra categories — only chosen ones will show it)</span></Label>
                <Input
                  className="mt-1"
                  value={form.visible_categories.join(", ")}
                  onChange={(e) => setForm({ ...form, visible_categories: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="Flash Sale, 11.11, Top Picks"
                />
                <p className="text-[10px] text-muted-foreground mt-1">If empty, the product appears under its primary category only.</p>
              </div>

              {currentStore && (
                <MultiImageUploader
                  storeId={currentStore.id}
                  values={form.images}
                  onChange={(urls) => setForm({ ...form, images: urls })}
                />
              )}

              {/* Marketing / Storefront badges */}
              <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/30">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Storefront badges</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Badge</Label>
                    <Select value={form.badge} onValueChange={(v: any) => setForm({ ...form, badge: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="Deal">🔥 Deal</SelectItem>
                        <SelectItem value="Hot">✨ Hot</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Sale tag <span className="text-muted-foreground text-[10px]">(e.g. 11.11)</span></Label>
                    <Input
                      value={form.sale_tag}
                      onChange={(e) => setForm({ ...form, sale_tag: e.target.value })}
                      maxLength={10}
                      placeholder="11.11"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">Free delivery badge</Label>
                    <p className="text-xs text-muted-foreground">Show "Free Delivery" on the card</p>
                  </div>
                  <Switch checked={form.free_delivery} onCheckedChange={(v) => setForm({ ...form, free_delivery: v })} />
                </div>
                <div>
                  <Label>Flash sale ends at <span className="text-muted-foreground text-[10px]">(shows live countdown on card)</span></Label>
                  <Input
                    type="datetime-local"
                    value={form.sale_ends_at}
                    onChange={(e) => setForm({ ...form, sale_ends_at: e.target.value })}
                  />
                </div>
              </div>

              <div><Label>Description (optional)</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} rows={3} /></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label className="font-medium">Publish on store</Label>
                  <p className="text-xs text-muted-foreground">Visible to public visitors</p>
                </div>
                <Switch checked={form.is_published} onCheckedChange={(v) => setForm({ ...form, is_published: v })} />
              </div>
              <Button type="submit" className="w-full">Save item</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <Card className="p-16 text-center text-muted-foreground">
          <Package className="mx-auto mb-3 opacity-30" size={32} />
          No items yet.
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((it) => {
            const cover = coverImage(it);
            const imgCount = Array.isArray(it.images) ? it.images.length : (it.image_url ? 1 : 0);
            return (
              <Card key={it.id} className="p-5 hover:shadow-elev transition-smooth group">
                <div className="aspect-video rounded-lg bg-gradient-hero mb-4 overflow-hidden grid place-items-center text-3xl font-bold text-foreground/30 relative">
                  {cover ? <img src={cover} alt={it.name} className="w-full h-full object-cover" /> : it.name.charAt(0).toUpperCase()}
                  {imgCount > 1 && (
                    <span className="absolute bottom-1.5 right-1.5 bg-foreground/80 text-background text-[10px] px-1.5 py-0.5 rounded">+{imgCount - 1}</span>
                  )}
                </div>
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{it.name}</div>
                    <div className="text-xs text-muted-foreground">{it.category ?? "Uncategorized"} · {it.stock} in stock</div>
                  </div>
                  <button disabled={!canEdit} onClick={() => remove(it.id)} className="opacity-0 group-hover:opacity-100 transition-smooth text-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex items-baseline gap-2 mt-3">
                  <div className="text-xl font-semibold">{fmt(it.price_cents)}</div>
                  {it.original_price_cents && <div className="text-sm text-muted-foreground line-through">{fmt(it.original_price_cents)}</div>}
                </div>
                {(it.badge || it.sale_tag || it.free_delivery) && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {it.badge && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-500 text-white">{it.badge}</span>}
                    {it.sale_tag && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">{it.sale_tag}</span>}
                    {it.free_delivery && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/40 text-emerald-600">Free Delivery</span>}
                  </div>
                )}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <span className="flex items-center gap-1.5 text-xs">
                    {it.is_published ? <><Eye size={13} className="text-brand-mint" /> Published</> : <><EyeOff size={13} className="text-muted-foreground" /> Hidden</>}
                  </span>
                  <Switch disabled={!canEdit} checked={it.is_published} onCheckedChange={() => togglePublish(it)} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Items;
