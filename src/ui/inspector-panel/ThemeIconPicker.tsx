import { useEffect, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FigmaColorPicker } from "@/editor/components/toolbars/FigmaColorPicker";
import {
  ThemeIcon,
  loadThemeIconCatalog,
  type ThemeIconConfig,
  type ThemeIconLibrary,
} from "@/theme-engine/chrome";

const libraries: Array<{ id: ThemeIconLibrary; label: string }> = [
  { id: "heroicons", label: "Heroicons" },
  { id: "phosphor", label: "Phosphor" },
  { id: "tabler", label: "Tabler" },
  { id: "react-icons", label: "React Icons" },
];

export type ThemeIconPickerProps = {
  label: string;
  value: ThemeIconConfig;
  brandColors?: string[];
  onChange: (value: ThemeIconConfig) => void;
};

export const ThemeIconPicker = ({
  label,
  value,
  brandColors = [],
  onChange,
}: ThemeIconPickerProps) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    loadThemeIconCatalog(draft.library)
      .then((names) => {
        if (active) setCatalog(names);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [draft.library, open]);

  const visibleIcons = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = normalized
      ? catalog.filter((name) => name.toLowerCase().includes(normalized))
      : catalog;
    return matches.slice(0, 120);
  }, [catalog, query]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full justify-between border-[#444] bg-[#333] px-2 text-xs text-white hover:bg-[#3a3a3a]"
        >
          <span className="flex items-center gap-2">
            <ThemeIcon config={value} />
            <span>{label}</span>
          </span>
          <span className="max-w-24 truncate text-[10px] text-[#9a9a9a]">{value.name}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(720px,90vh)] max-w-2xl overflow-hidden border-[#444] bg-[#2c2c2c] p-0 text-white">
        <DialogHeader className="border-b border-[#444] px-4 py-3">
          <DialogTitle className="text-sm">Choose {label.toLowerCase()}</DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 gap-0 md:grid-cols-[1fr_220px]">
          <div className="min-h-0 border-b border-[#444] p-3 md:border-b-0 md:border-r">
            <div className="mb-3 grid grid-cols-2 gap-1 sm:grid-cols-4">
              {libraries.map((library) => (
                <button
                  key={library.id}
                  type="button"
                  aria-pressed={draft.library === library.id}
                  onClick={() => {
                    setDraft((current) => ({ ...current, library: library.id }));
                    setQuery("");
                  }}
                  className={`h-8 rounded px-2 text-[10px] font-semibold ${
                    draft.library === library.id
                      ? "bg-[#0178ff] text-white"
                      : "bg-[#383838] text-[#d0d0d0] hover:bg-[#444]"
                  }`}
                >
                  {library.label}
                </button>
              ))}
            </div>

            <label className="relative mb-3 block">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#999]"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search icons"
                className="h-9 border-[#444] bg-[#333] pl-8 text-xs text-white"
              />
            </label>

            <div className="h-[350px] overflow-y-auto rounded border border-[#444] bg-[#242424] p-2">
              {loading ? (
                <div className="grid h-full place-items-center text-xs text-[#999]">Loading icons...</div>
              ) : (
                <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
                  {visibleIcons.map((name) => {
                    const config = { ...draft, name };
                    const selected = draft.name === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        title={name}
                        aria-label={name}
                        aria-pressed={selected}
                        onClick={() => setDraft(config)}
                        className={`relative grid aspect-square place-items-center rounded ${
                          selected
                            ? "bg-[#0178ff] text-white"
                            : "text-[#d8d8d8] hover:bg-white/10"
                        }`}
                      >
                        <ThemeIcon config={{ ...config, color: selected ? "#ffffff" : "#d8d8d8", size: 20 }} />
                        {selected ? <Check size={10} className="absolute right-0.5 top-0.5" /> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 p-4">
            <div className="grid h-28 place-items-center rounded border border-[#444] bg-[#202020]">
              <ThemeIcon config={draft} />
            </div>
            <label className="flex items-center justify-between rounded border border-[#444] bg-[#333] px-2 py-2 text-xs">
              <span>Color</span>
              <FigmaColorPicker
                value={draft.color}
                label={`${label} color`}
                brandColors={brandColors}
                onChange={(color) => setDraft((current) => ({ ...current, color }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase text-[#aaa]">Size</span>
              <div className="grid grid-cols-[1fr_64px] gap-2">
                <input
                  type="range"
                  min={16}
                  max={48}
                  value={draft.size}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, size: Number(event.target.value) }))
                  }
                  className="accent-[#0178ff]"
                />
                <Input
                  type="number"
                  min={16}
                  max={48}
                  value={draft.size}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      size: Math.max(16, Math.min(48, Number(event.target.value) || 16)),
                    }))
                  }
                  className="h-8 border-[#444] bg-[#333] text-xs text-white"
                />
              </div>
            </label>
            <Button
              type="button"
              className="w-full bg-[#0178ff] text-white hover:bg-[#0787e3]"
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
