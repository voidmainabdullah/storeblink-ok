import { useRef, useState } from "react";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ============ Inline banner uploader ============
export const BannerUploadInline = ({ onAdd }: { onAdd: (file: File | null, url: string | null) => void }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <Input className="h-7 text-xs" placeholder="Image URL…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button size="sm" className="h-7" onClick={() => { if (url) { onAdd(null, url); setUrl(""); } }} disabled={!url}><Plus size={12} /></Button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { onAdd(f, null); e.target.value = ""; } }} />
      <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="w-full h-7 text-xs">
        <Upload size={11} className="mr-1.5" /> Upload banner
      </Button>
    </div>
  );
};

