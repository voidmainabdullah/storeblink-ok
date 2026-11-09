import { useEffect, useRef, useState } from "react";
import { Command, CornerDownLeft, Search } from "lucide-react";
import type { PaletteCommand } from "@/editor/types/editor";

// ============= Command palette (⌘K) =============
export const CommandPalette = ({
  open, onClose, commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}) => {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? commands.filter((c) => `${c.label} ${c.group}`.toLowerCase().includes(q))
    : commands;
  const grouped = filtered.reduce<Record<string, PaletteCommand[]>>((acc, c) => {
    (acc[c.group] ??= []).push(c);
    return acc;
  }, {});
  const flatVisible = filtered.slice(0, 200);

  useEffect(() => { setActiveIdx(0); }, [query]);

  if (!open) return null;

  const runAt = (idx: number) => {
    const cmd = flatVisible[idx];
    if (!cmd || cmd.disabled) return;
    cmd.run();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-foreground/20 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-border bg-background shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 border-b border-border">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(flatVisible.length - 1, i + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); runAt(activeIdx); }
              else if (e.key === "Escape") { e.preventDefault(); onClose(); }
            }}
            placeholder="Search actions, sections, elements…"
            className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {flatVisible.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">No matching commands</div>
          )}
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="mb-1.5 last:mb-0">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</div>
              {items.map((cmd) => {
                const idx = flatVisible.indexOf(cmd);
                const active = idx === activeIdx;
                const Icon = cmd.icon;
                return (
                  <button
                    key={cmd.id}
                    disabled={cmd.disabled}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => runAt(idx)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-[13px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${active ? "bg-foreground text-background" : "hover:bg-muted"}`}
                  >
                    <Icon size={13} className="shrink-0" />
                    <span className="flex-1 truncate">{cmd.label}</span>
                    {cmd.hint && <span className={`text-[10px] ${active ? "text-background/70" : "text-muted-foreground"}`}>{cmd.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><CornerDownLeft size={10} /> Select</span>
          <span className="flex items-center gap-1">↑↓ Navigate</span>
          <span className="ml-auto flex items-center gap-1"><Command size={10} />K to toggle</span>
        </div>
      </div>
    </div>
  );
};

