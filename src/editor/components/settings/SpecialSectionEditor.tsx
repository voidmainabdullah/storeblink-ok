import { useRef } from "react";
import { ImageIcon as ImgIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadImage } from "@/lib/uploadImage";
import type { SpecialSectionItem } from "@/lib/storeTheme";

// ============ Special section editor ============
export const SpecialSectionEditor = ({
  section, items, userId, onUpdate, onRemove,
}: {
  section: SpecialSectionItem;
  items: any[];
  userId: string;
  onUpdate: (patch: Partial<SpecialSectionItem>) => void;
  onRemove: () => void;
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const toggleProduct = (id: string) => {
    const has = section.productIds.includes(id);
    onUpdate({ productIds: has ? section.productIds.filter((p) => p !== id) : [...section.productIds, id] });
  };
  const onLogoFile = async (f: File) => {
    try {
      const url = await uploadImage("store-banners", userId, f);
      onUpdate({ logoUrl: url });
    } catch {}
  };
  return (
    <div className="rounded-lg border border-border p-3 bg-background space-y-2">
      <div className="flex items-start gap-2">
        <button type="button" onClick={() => fileRef.current?.click()}
          className="w-10 h-10 rounded bg-muted shrink-0 grid place-items-center overflow-hidden border">
          {section.logoUrl ? <img src={section.logoUrl} alt="" className="w-full h-full object-cover" /> : <ImgIcon size={14} className="text-muted-foreground" />}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onLogoFile(f); e.target.value = ""; }} />
        <div className="flex-1 min-w-0 space-y-1">
          <Input className="h-7 text-xs font-semibold" value={section.title} onChange={(e) => onUpdate({ title: e.target.value })} placeholder="Section title" />
          <Input className="h-7 text-xs" value={section.subtitle ?? ""} onChange={(e) => onUpdate({ subtitle: e.target.value })} placeholder="Subtitle (optional)" />
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={onRemove}><Trash2 size={12} /></Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">Accent (optional)</Label>
          <Input type="color" value={section.accent ?? "#5669ff"} onChange={(e) => onUpdate({ accent: e.target.value })} className="h-7 p-0.5 cursor-pointer" />
        </div>
        <div>
          <Label className="text-[10px]">Ends at (optional)</Label>
          <Input type="datetime-local" className="h-7 text-[10px]"
            value={section.endsAt ? new Date(section.endsAt).toISOString().slice(0, 16) : ""}
            onChange={(e) => onUpdate({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })} />
        </div>
      </div>
      <div>
        <Label className="text-[10px]">Products in this section ({section.productIds.length})</Label>
        <div className="max-h-40 overflow-y-auto border rounded p-1 space-y-0.5">
          {items.length === 0 ? (
            <div className="text-[10px] text-muted-foreground text-center py-2">Add products in the Items page first.</div>
          ) : items.map((it) => {
            const checked = section.productIds.includes(it.id);
            return (
              <label key={it.id} className="flex items-center gap-2 px-1.5 py-1 hover:bg-muted rounded cursor-pointer text-[11px]">
                <input type="checkbox" checked={checked} onChange={() => toggleProduct(it.id)} className="shrink-0" />
                <span className="truncate flex-1">{it.name}</span>
                {it.category && <span className="text-[9px] text-muted-foreground shrink-0">{it.category}</span>}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
};

