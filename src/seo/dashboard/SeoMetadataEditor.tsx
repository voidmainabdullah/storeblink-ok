import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  SeoDashboardResource,
  SeoMetadataInput,
} from "./seo-dashboard.types";

type SeoMetadataEditorProps = {
  resource: SeoDashboardResource | null;
  open: boolean;
  saving: boolean;
  onOpenChange(open: boolean): void;
  onSave(input: SeoMetadataInput): void;
};

const inputForResource = (resource: SeoDashboardResource): SeoMetadataInput => ({
  seoTitle: resource.seoTitle ?? "",
  metaDescription: resource.metaDescription ?? "",
  indexing: resource.indexing,
  canonicalMode: resource.canonicalMode,
  customCanonicalUrl: resource.customCanonicalUrl ?? "",
  socialTitle: resource.socialTitle ?? "",
  socialDescription: resource.socialDescription ?? "",
  socialImageId: resource.socialImageId ?? "",
  customMetaTags: resource.customMetaTags,
  alternates: resource.alternates,
});

export const SeoMetadataEditor = ({
  resource,
  open,
  saving,
  onOpenChange,
  onSave,
}: SeoMetadataEditorProps) => {
  const [form, setForm] = useState<SeoMetadataInput | null>(null);

  useEffect(() => {
    if (resource) setForm(inputForResource(resource));
  }, [resource]);

  if (!resource || !form) return null;
  const update = <K extends keyof SeoMetadataInput>(key: K, value: SeoMetadataInput[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto sm:rounded-none">
        <DialogHeader>
          <DialogTitle>Edit search appearance</DialogTitle>
          <DialogDescription>{resource.title} - {resource.route}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <section className="space-y-3" aria-labelledby="search-result-heading">
            <h3 id="search-result-heading" className="text-sm font-semibold">Search result</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="seo-title">SEO title</Label>
                <span className="text-xs text-muted-foreground">{form.seoTitle.length}/120</span>
              </div>
              <Input
                id="seo-title"
                maxLength={120}
                value={form.seoTitle}
                placeholder={resource.title}
                onChange={(event) => update("seoTitle", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="seo-description">Meta description</Label>
                <span className="text-xs text-muted-foreground">{form.metaDescription.length}/320</span>
              </div>
              <Textarea
                id="seo-description"
                maxLength={320}
                value={form.metaDescription}
                onChange={(event) => update("metaDescription", event.target.value)}
              />
            </div>
          </section>

          <section className="grid gap-4 border-t pt-5 sm:grid-cols-2" aria-labelledby="indexing-heading">
            <h3 id="indexing-heading" className="col-span-full text-sm font-semibold">Indexing and canonical</h3>
            <div className="space-y-2">
              <Label>Search visibility</Label>
              <Select
                value={form.indexing}
                onValueChange={(value: SeoMetadataInput["indexing"]) => update("indexing", value)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="index_follow">Index and follow</SelectItem>
                  <SelectItem value="noindex_follow">Do not index, follow links</SelectItem>
                  <SelectItem value="noindex_nofollow">Do not index or follow</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Canonical URL</Label>
              <Select
                value={form.canonicalMode}
                onValueChange={(value: SeoMetadataInput["canonicalMode"]) => update("canonicalMode", value)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">Automatic</SelectItem>
                  <SelectItem value="custom">Custom URL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.canonicalMode === "custom" ? (
              <div className="col-span-full space-y-2">
                <Label htmlFor="canonical-url">Custom canonical URL</Label>
                <Input
                  id="canonical-url"
                  type="url"
                  value={form.customCanonicalUrl}
                  placeholder="https://example.com/canonical-page"
                  onChange={(event) => update("customCanonicalUrl", event.target.value)}
                />
              </div>
            ) : null}
          </section>

          <section className="space-y-3 border-t pt-5" aria-labelledby="social-heading">
            <h3 id="social-heading" className="text-sm font-semibold">Social preview</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="social-title">Social title</Label>
                <Input
                  id="social-title"
                  maxLength={120}
                  value={form.socialTitle}
                  onChange={(event) => update("socialTitle", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="social-image">Social image URL</Label>
                <Input
                  id="social-image"
                  type="url"
                  value={form.socialImageId}
                  onChange={(event) => update("socialImageId", event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="social-description">Social description</Label>
              <Textarea
                id="social-description"
                maxLength={320}
                value={form.socialDescription}
                onChange={(event) => update("socialDescription", event.target.value)}
              />
            </div>
          </section>

          <section className="space-y-3 border-t pt-5" aria-labelledby="custom-tags-heading">
            <div className="flex items-center justify-between gap-3">
              <h3 id="custom-tags-heading" className="text-sm font-semibold">Custom meta tags</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={form.customMetaTags.length >= 20}
                onClick={() => update("customMetaTags", [
                  ...form.customMetaTags,
                  { attribute: "name", key: "author", content: "" },
                ])}
              >
                <Plus className="mr-2" size={14} /> Add tag
              </Button>
            </div>
            {form.customMetaTags.map((tag, index) => (
              <div key={`${index}-${tag.key}`} className="grid gap-2 sm:grid-cols-[120px_1fr_1.5fr_36px]">
                <Select
                  value={tag.attribute}
                  onValueChange={(attribute: "name" | "property") => update(
                    "customMetaTags",
                    form.customMetaTags.map((item, itemIndex) => itemIndex === index ? { ...item, attribute } : item),
                  )}
                >
                  <SelectTrigger aria-label="Meta attribute"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="property">Property</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  aria-label="Meta key"
                  value={tag.key}
                  onChange={(event) => update(
                    "customMetaTags",
                    form.customMetaTags.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item),
                  )}
                />
                <Input
                  aria-label="Meta content"
                  value={tag.content}
                  onChange={(event) => update(
                    "customMetaTags",
                    form.customMetaTags.map((item, itemIndex) => itemIndex === index ? { ...item, content: event.target.value } : item),
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Delete custom meta tag"
                  onClick={() => update("customMetaTags", form.customMetaTags.filter((_, itemIndex) => itemIndex !== index))}
                ><Trash2 size={15} /></Button>
              </div>
            ))}
          </section>

          <section className="space-y-3 border-t pt-5" aria-labelledby="alternates-heading">
            <div className="flex items-center justify-between gap-3">
              <h3 id="alternates-heading" className="text-sm font-semibold">Language alternates</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={form.alternates.length >= 50}
                onClick={() => update("alternates", [...form.alternates, { locale: "en", url: "" }])}
              >
                <Plus className="mr-2" size={14} /> Add alternate
              </Button>
            </div>
            {form.alternates.map((alternate, index) => (
              <div key={`${index}-${alternate.locale}`} className="grid gap-2 sm:grid-cols-[110px_1fr_36px]">
                <Input
                  aria-label="Alternate locale"
                  value={alternate.locale}
                  onChange={(event) => update(
                    "alternates",
                    form.alternates.map((item, itemIndex) => itemIndex === index ? { ...item, locale: event.target.value } : item),
                  )}
                />
                <Input
                  aria-label="Alternate URL"
                  type="url"
                  value={alternate.url}
                  onChange={(event) => update(
                    "alternates",
                    form.alternates.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item),
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Delete language alternate"
                  onClick={() => update("alternates", form.alternates.filter((_, itemIndex) => itemIndex !== index))}
                ><Trash2 size={15} /></Button>
              </div>
            ))}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={saving}>
            {saving ? <Loader2 className="mr-2 animate-spin" size={15} /> : null}
            Save metadata
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
