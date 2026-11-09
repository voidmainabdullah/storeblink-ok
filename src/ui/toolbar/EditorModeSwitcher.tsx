import { Palette, Store } from "lucide-react";
import type { EditorMode } from "@/interaction/modes";

export type EditorModeSwitcherProps = {
  mode: EditorMode;
  onChange: (mode: EditorMode) => void;
};

const modes = [
  {
    id: "fixed" as const,
    label: "Store",
    title: "Store mode: edit store content, navigation labels, logos, and images",
    icon: Store,
  },
  {
    id: "independent" as const,
    label: "Design",
    title: "Design mode: enable layout and structure controls",
    icon: Palette,
  },
];

export const EditorModeSwitcher = ({ mode, onChange }: EditorModeSwitcherProps) => (
  <div
    role="group"
    aria-label="Editor mode"
    className="flex h-9 shrink-0 items-center rounded-md border border-[#4a4a4a] bg-[#242424] p-0.5"
  >
    {modes.map((option) => {
      const Icon = option.icon;
      const active = mode === option.id;
      return (
        <button
          key={option.id}
          type="button"
          title={option.title}
          aria-label={option.title}
          aria-pressed={active}
          onClick={() => onChange(option.id)}
          className={`flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors ${
            active
              ? "bg-[#0178ff] text-white"
              : "text-[#b8b8b8] hover:bg-white/10 hover:text-white"
          }`}
        >
          <Icon size={14} />
          <span>{option.label}</span>
        </button>
      );
    })}
  </div>
);
