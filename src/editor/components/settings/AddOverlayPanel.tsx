import { useRef, useState } from "react";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SECTION_LABELS, type SectionKey } from "@/lib/storeTheme";

export const AddOverlayPanel = ({
  onAdd,
}: {
  onAdd: (file: File | null, url: string | null, section: SectionKey) => void;
}) => {
  const [section, setSection] = useState<SectionKey>("hero");
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
      <Label className="text-xs">Add new image overlay</Label>
      <Select value={section} onValueChange={(v: any) => setSection(v)}>
        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(["hero", "trustStrip", "about", "flashDeals", "specialSections", "allProducts", "newsletter", "footer"] as SectionKey[]).map((k) => (
            <SelectItem key={k} value={k}>{SECTION_LABELS[k]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        <Input placeholder="Paste image URL…" value={url} onChange={(e) => setUrl(e.target.value)} className="h-9 text-xs" />
        <Button size="sm" onClick={() => { if (url) { onAdd(null, url, section); setUrl(""); } }} disabled={!url}>
          <Plus size={13} />
        </Button>
      </div>
      <div className="text-center text-[10px] text-muted-foreground">or</div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { onAdd(f, null, section); e.target.value = ""; } }} />
      <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="w-full h-9 text-xs">
        <Upload size={13} className="mr-1.5" /> Upload from device
      </Button>
    </div>
  );
};

