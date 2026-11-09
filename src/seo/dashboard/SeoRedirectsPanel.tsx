import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SeoRedirect } from "./seo-dashboard.types";

type RedirectStatus = 301 | 302 | 307 | 308;

type SeoRedirectsPanelProps = {
  redirects: readonly SeoRedirect[];
  saving: boolean;
  deleting: boolean;
  onSave(input: { sourcePath: string; destinationPath: string; statusCode: RedirectStatus }): Promise<void>;
  onDelete(id: string): void;
};

export const SeoRedirectsPanel = ({
  redirects,
  saving,
  deleting,
  onSave,
  onDelete,
}: SeoRedirectsPanelProps) => {
  const [sourcePath, setSourcePath] = useState("");
  const [destinationPath, setDestinationPath] = useState("");
  const [statusCode, setStatusCode] = useState<RedirectStatus>(301);
  const submit = async () => {
    try {
      await onSave({ sourcePath, destinationPath, statusCode });
      setSourcePath("");
      setDestinationPath("");
    } catch {
      // The mutation hook owns the user-visible error; retain input for retry.
    }
  };
  return (
    <div className="space-y-6">
      <section className="border bg-background p-5" aria-labelledby="new-redirect-heading">
        <h2 id="new-redirect-heading" className="text-sm font-semibold">Add storefront redirect</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_130px_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor="redirect-source">From</Label>
            <Input
              id="redirect-source"
              value={sourcePath}
              placeholder="/old-page"
              onChange={(event) => setSourcePath(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="redirect-destination">To</Label>
            <Input
              id="redirect-destination"
              value={destinationPath}
              placeholder="/new-page"
              onChange={(event) => setDestinationPath(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="redirect-status">Status</Label>
            <Select value={String(statusCode)} onValueChange={(value) => setStatusCode(Number(value) as RedirectStatus)}>
              <SelectTrigger id="redirect-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="301">301</SelectItem>
                <SelectItem value="302">302</SelectItem>
                <SelectItem value="307">307</SelectItem>
                <SelectItem value="308">308</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button disabled={saving || !sourcePath || !destinationPath} onClick={() => void submit()}>
            {saving ? <Loader2 className="mr-2 animate-spin" size={15} /> : <Plus className="mr-2" size={15} />}
            Add
          </Button>
        </div>
      </section>

      <div className="divide-y border bg-background">
        {redirects.map((redirect) => (
          <article key={redirect.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_80px_44px] sm:items-center">
            <code className="truncate text-xs">{redirect.sourcePath}</code>
            <code className="truncate text-xs text-muted-foreground">{redirect.destinationPath}</code>
            <span className="text-xs font-medium">{redirect.statusCode}</span>
            <Button
              variant="ghost"
              size="icon"
              disabled={deleting}
              aria-label={`Delete redirect from ${redirect.sourcePath}`}
              onClick={() => onDelete(redirect.id)}
            ><Trash2 size={15} /></Button>
          </article>
        ))}
        {!redirects.length ? (
          <p className="p-6 text-sm text-muted-foreground">No custom redirects.</p>
        ) : null}
      </div>
    </div>
  );
};
