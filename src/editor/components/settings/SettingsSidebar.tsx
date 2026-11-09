import type { Dispatch, SetStateAction } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { TemplatePreview } from "@/components/store/TemplatePreview";
import { TEMPLATES, type StoreTemplate } from "@/components/store/templates";
import { BG_PRESETS, COLORS, TEXT_FIELDS } from "@/editor/constants/editorConstants";
import { AddOverlayPanel } from "@/editor/components/settings/AddOverlayPanel";
import { BannerUploadInline } from "@/editor/components/settings/BannerUploadInline";
import { ColorRow } from "@/editor/components/controls/ColorRow";
import { ReorderableSections, SectionToggleRow } from "@/editor/components/sidebar/ReorderableSections";
import { SpecialSectionEditor } from "@/editor/components/settings/SpecialSectionEditor";
import { FONT_MAP, THEME_PRESETS, type SectionKey, type SpecialSectionItem, type StoreTheme } from "@/lib/storeTheme";

export const SettingsSidebar = ({
  activeTab, setActiveTab, tabItems, form, setForm, theme, setTheme, items, userId, width = 320,
  onToggleSection, onSetTextOverride, onAddOverlay, onAddBanner, onRemoveBanner, onMoveBanner,
  onAddSpecialSection, onUpdateSpecialSection, onRemoveSpecialSection, onApplyPreset, onResetTheme,
}: {
  activeTab: string;
  setActiveTab: (v: string) => void;
  tabItems: { id: string; label: string; icon: any }[];
  width?: number;
  form: {
    business_name: string;
    store_slug: string;
    store_tagline: string;
    store_about: string;
    store_color: string;
    store_banner_url: string;
    store_template: StoreTemplate;
    banners: string[];
    special_sections: SpecialSectionItem[];
  };
  setForm: Dispatch<SetStateAction<any>>;
  theme: StoreTheme;
  setTheme: Dispatch<SetStateAction<StoreTheme>>;
  items: any[];
  userId?: string;
  onToggleSection: (k: SectionKey) => void;
  onSetTextOverride: (k: keyof StoreTheme["text_overrides"], v: string) => void;
  onAddOverlay: (file: File | null, url: string | null, section: SectionKey) => void;
  onAddBanner: (file: File | null, url: string | null) => void;
  onRemoveBanner: (i: number) => void;
  onMoveBanner: (i: number, dir: -1 | 1) => void;
  onAddSpecialSection: () => void;
  onUpdateSpecialSection: (id: string, patch: Partial<SpecialSectionItem>) => void;
  onRemoveSpecialSection: (id: string) => void;
  onApplyPreset: (preset: typeof THEME_PRESETS[number]) => void;
  onResetTheme: () => void;
}) => (
  <aside style={{ width }} className="sb-editor-panel shrink-0 border-l border-border flex flex-col overflow-hidden">
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border p-3">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase text-muted-foreground">Inspector</div>
            <div className="text-sm font-semibold text-foreground">Design</div>
          </div>
          <span className="rounded border border-border bg-muted px-2 py-1 text-[10px] text-muted-foreground">100%</span>
        </div>
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0">
          {tabItems.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="h-8 shrink-0 rounded-md px-2.5 text-[11px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className="flex-1 overflow-y-auto p-3.5 space-y-1">
        <TabsContent value="presets" className="mt-0 space-y-2">
          {THEME_PRESETS.map((preset) => (
            <button key={preset.id} onClick={() => onApplyPreset(preset)} className="w-full rounded-lg border border-border p-2 text-left hover:bg-muted/50">
              <div className="text-sm font-semibold">{preset.name}</div>
              <div className="text-xs text-muted-foreground">{preset.description}</div>
            </button>
          ))}
        </TabsContent>

        <TabsContent value="branding" className="mt-0 space-y-3">
          <div>
            <Label>Store name</Label>
            <Input value={form.business_name} onChange={(e) => setForm((f: any) => ({ ...f, business_name: e.target.value }))} />
          </div>
          <div>
            <Label>Tagline</Label>
            <Input value={form.store_tagline} onChange={(e) => setForm((f: any) => ({ ...f, store_tagline: e.target.value }))} />
          </div>
          <div>
            <Label>About</Label>
            <Textarea rows={4} value={form.store_about} onChange={(e) => setForm((f: any) => ({ ...f, store_about: e.target.value }))} />
          </div>
          <ColorRow label="Brand color" value={form.store_color} onChange={(c) => setForm((f: any) => ({ ...f, store_color: c }))} presets={COLORS} />
        </TabsContent>

        <TabsContent value="design" className="mt-0 space-y-3">
          <ColorRow label="Background" value={theme.bg} onChange={(c) => setTheme((th) => ({ ...th, bg: c }))} presets={BG_PRESETS} />
          <ColorRow label="Surface" value={theme.surface} onChange={(c) => setTheme((th) => ({ ...th, surface: c }))} presets={BG_PRESETS} />
          <ColorRow label="Text" value={theme.text} onChange={(c) => setTheme((th) => ({ ...th, text: c }))} presets={["#0F172A", "#111111", "#FFFFFF", "#1F2937", "#3F0418"]} />
          <div>
            <Label>Font</Label>
            <Select value={theme.font} onValueChange={(font: any) => setTheme((th) => ({ ...th, font }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(FONT_MAP).map((font) => <SelectItem key={font} value={font}>{font}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Radius {theme.radius}px</Label>
            <Slider value={[theme.radius]} min={0} max={40} step={1} onValueChange={([radius]) => setTheme((th) => ({ ...th, radius }))} />
          </div>
          <Button variant="outline" size="sm" onClick={onResetTheme}>Reset theme</Button>
        </TabsContent>

        <TabsContent value="layout" className="mt-0 space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-2">
            <Label>Compact store</Label>
            <Switch checked={!!theme.compact} onCheckedChange={(compact) => setTheme((th) => ({ ...th, compact }))} />
          </div>
          <ReorderableSections order={theme.section_order} sections={theme.sections} onToggle={onToggleSection} onReorder={(section_order) => setTheme((th) => ({ ...th, section_order }))} />
        </TabsContent>

        <TabsContent value="sections" className="mt-0 space-y-3">
          {(Object.keys(theme.sections) as SectionKey[]).map((k) => (
            <SectionToggleRow key={k} k={k} on={theme.sections[k]} onToggle={() => onToggleSection(k)} draggable={false} />
          ))}
          <Button size="sm" variant="outline" onClick={onAddSpecialSection} className="w-full">
            <Plus size={13} className="mr-1.5" /> Add special section
          </Button>
          {userId && form.special_sections.map((section) => (
            <SpecialSectionEditor
              key={section.id}
              section={section}
              items={items}
              userId={userId}
              onUpdate={(patch) => onUpdateSpecialSection(section.id, patch)}
              onRemove={() => onRemoveSpecialSection(section.id)}
            />
          ))}
        </TabsContent>

        <TabsContent value="text" className="mt-0 space-y-2">
          {TEXT_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <Label className="text-xs">{label}</Label>
              <Input className="h-8 text-xs" value={theme.text_overrides[key] ?? ""} onChange={(e) => onSetTextOverride(key, e.target.value)} />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="images" className="mt-0 space-y-3">
          <BannerUploadInline onAdd={onAddBanner} />
          {form.banners.map((banner, i) => (
            <div key={`${banner}-${i}`} className="flex items-center gap-2 rounded-lg border p-2">
              <img src={banner} alt="" className="h-10 w-14 rounded object-cover" />
              <div className="min-w-0 flex-1 truncate text-xs">{banner}</div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onMoveBanner(i, -1)}><ChevronUp size={12} /></Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onMoveBanner(i, 1)}><ChevronDown size={12} /></Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => onRemoveBanner(i)}><Trash2 size={12} /></Button>
            </div>
          ))}
          <AddOverlayPanel onAdd={onAddOverlay} />
        </TabsContent>

        <TabsContent value="template" className="mt-0 space-y-3">
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => setForm((f: any) => ({ ...f, store_template: template.id }))}
              className={`w-full rounded-lg border p-2 text-left transition-colors ${form.store_template === template.id ? "border-foreground bg-muted" : "border-border hover:bg-muted/50"}`}
            >
              <TemplatePreview id={template.preview} color={form.store_color} />
              <div className="mt-2 text-sm font-semibold">{template.name}</div>
              <div className="text-xs text-muted-foreground">{template.tagline}</div>
            </button>
          ))}
        </TabsContent>
      </div>
    </Tabs>
  </aside>
);

