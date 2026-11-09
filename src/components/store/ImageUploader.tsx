import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Link as LinkIcon, X, Loader2 } from "lucide-react";
import { uploadImage } from "@/lib/uploadImage";
import { useToast } from "@/hooks/use-toast";

type Props = {
  bucket: "product-images" | "store-banners";
  storeId: string;
  value: string;
  onChange: (url: string) => void;
  label?: string;
  aspect?: "square" | "video";
};

export const ImageUploader = ({ bucket, storeId, value, onChange, label = "Image", aspect = "square" }: Props) => {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadImage(bucket, storeId, file);
      onChange(url);
      toast({ title: "Image uploaded" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`px-3 py-1 text-xs rounded-md transition-smooth flex items-center gap-1.5 ${mode === "upload" ? "bg-background shadow-soft" : "text-muted-foreground"}`}
        >
          <Upload size={12} /> Upload
        </button>
        <button
          type="button"
          onClick={() => setMode("url")}
          className={`px-3 py-1 text-xs rounded-md transition-smooth flex items-center gap-1.5 ${mode === "url" ? "bg-background shadow-soft" : "text-muted-foreground"}`}
        >
          <LinkIcon size={12} /> Use URL
        </button>
      </div>

      {mode === "upload" ? (
        <div
          onClick={() => inputRef.current?.click()}
          className={`relative ${aspect === "square" ? "aspect-square max-w-[220px]" : "aspect-video"} rounded-lg border-2 border-dashed border-border hover:border-foreground/30 cursor-pointer overflow-hidden bg-muted grid place-items-center transition-smooth`}
        >
          {value ? (
            <>
              <img src={value} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange(""); }}
                className="absolute top-2 right-2 bg-foreground/80 text-background rounded-full p-1 hover:bg-foreground"
              >
                <X size={14} />
              </button>
            </>
          ) : uploading ? (
            <Loader2 className="animate-spin text-muted-foreground" />
          ) : (
            <div className="text-center text-muted-foreground p-4">
              <Upload className="mx-auto mb-2 opacity-50" size={20} />
              <div className="text-xs">Click to upload (max 50MB)</div>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
        </div>
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://example.com/image.jpg"
          maxLength={500}
        />
      )}
    </div>
  );
};
