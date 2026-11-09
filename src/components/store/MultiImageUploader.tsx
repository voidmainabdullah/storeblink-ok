import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Link as LinkIcon, X, Loader2, Plus, Star } from "lucide-react";
import { uploadImage } from "@/lib/uploadImage";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Props = {
  storeId: string;
  values: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  label?: string;
};

export const MultiImageUploader = ({ storeId, values, onChange, max = 6, label = "Product images" }: Props) => {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [showUrl, setShowUrl] = useState(false);

  const handleFiles = async (files: FileList) => {
    setUploading(true);
    const remaining = max - values.length;
    const list = Array.from(files).slice(0, remaining);
    const next = [...values];
    try {
      for (const f of list) {
        const url = await uploadImage("product-images", storeId, f);
        next.push(url);
      }
      onChange(next);
      toast({ title: `Uploaded ${list.length} image${list.length > 1 ? "s" : ""}` });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const addUrl = () => {
    const u = urlInput.trim();
    if (!u) return;
    if (values.length >= max) { toast({ title: `Max ${max} images`, variant: "destructive" }); return; }
    onChange([...values, u]);
    setUrlInput("");
    setShowUrl(false);
  };

  const remove = (i: number) => onChange(values.filter((_, idx) => idx !== i));
  const makePrimary = (i: number) => {
    if (i === 0) return;
    const next = [...values];
    const [picked] = next.splice(i, 1);
    next.unshift(picked);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">{values.length}/{max} · first is cover</span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {values.map((url, i) => (
          <div key={url + i} className={cn(
            "relative aspect-square rounded-lg overflow-hidden border-2 group",
            i === 0 ? "border-primary" : "border-border"
          )}>
            <img src={url} alt="" className="w-full h-full object-cover" />
            {i === 0 && (
              <span className="absolute bottom-1 left-1 bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded">
                COVER
              </span>
            )}
            <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {i !== 0 && (
                <button
                  type="button"
                  onClick={() => makePrimary(i)}
                  className="bg-background/90 hover:bg-background rounded-full p-1 shadow"
                  title="Set as cover"
                >
                  <Star size={11} />
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                className="bg-foreground/80 text-background hover:bg-foreground rounded-full p-1"
                title="Remove"
              >
                <X size={11} />
              </button>
            </div>
          </div>
        ))}

        {values.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-foreground/40 grid place-items-center text-muted-foreground hover:text-foreground transition-colors"
          >
            {uploading ? <Loader2 className="animate-spin" size={18} /> : (
              <div className="text-center">
                <Plus size={18} className="mx-auto" />
                <div className="text-[10px] mt-0.5">Upload</div>
              </div>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }}
      />

      {!showUrl ? (
        <button
          type="button"
          onClick={() => setShowUrl(true)}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <LinkIcon size={11} /> or add by URL
        </button>
      ) : (
        <div className="flex gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://example.com/image.jpg"
            className="h-8 text-xs"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
          />
          <button type="button" onClick={addUrl} className="text-xs px-3 rounded-md bg-foreground text-background hover:opacity-90">Add</button>
          <button type="button" onClick={() => { setShowUrl(false); setUrlInput(""); }} className="text-xs px-2 text-muted-foreground hover:text-foreground">Cancel</button>
        </div>
      )}
    </div>
  );
};
