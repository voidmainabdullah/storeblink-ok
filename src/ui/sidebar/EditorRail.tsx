import { FileStack, LayoutTemplate, Palette, Plus, Sparkles, type LucideIcon } from "lucide-react";

export type EditorSidebarPanel = "layers" | "templates" | "tools" | "variables" | "assist";

type RailItem = {
  id: EditorSidebarPanel;
  label: string;
  icon: LucideIcon;
};

const RAIL_ITEMS: RailItem[] = [
  { id: "layers", label: "Pages", icon: FileStack },
  { id: "assist", label: "Assist", icon: Sparkles },
  { id: "templates", label: "Themes", icon: LayoutTemplate },
  { id: "tools", label: "Add", icon: Plus },
  { id: "variables", label: "Brand", icon: Palette },
];

export type EditorRailProps = {
  activePanel: EditorSidebarPanel;
  onPanelChange: (panel: EditorSidebarPanel) => void;
  disabledPanels?: EditorSidebarPanel[];
};

export const EditorRail = ({ activePanel, onPanelChange, disabledPanels = [] }: EditorRailProps) => (
  <nav
    aria-label="Editor panels"
    className="fixed inset-x-0 bottom-0 z-50 flex h-14 shrink-0 items-center border-t border-[#383838] bg-[#252525] px-1 sm:static sm:h-auto sm:min-h-0 sm:w-[52px] sm:flex-col sm:border-r sm:border-t-0 sm:px-0 sm:py-2"
  >
    <div className="mb-2 hidden h-8 w-8 place-items-center rounded bg-[#161616] text-[11px] font-black text-white sm:grid">
      SB
    </div>
    <div className="hidden h-px w-7 bg-[#3d3d3d] sm:block" />
    <div className="flex w-full items-center justify-around gap-1 sm:mt-2 sm:flex-col sm:justify-start">
      {RAIL_ITEMS.map(({ id, label, icon: Icon }) => {
        const active = activePanel === id;
        const disabled = disabledPanels.includes(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onPanelChange(id)}
            disabled={disabled}
            aria-label={label}
            aria-pressed={active}
            title={label}
            className={`flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 sm:h-[56px] sm:w-[46px] sm:flex-none ${
              active ? "bg-[#3d4d68] text-white" : "text-[#d0d0d0] hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon size={17} strokeWidth={1.8} />
            <span className="leading-none">{label}</span>
          </button>
        );
      })}
    </div>
  </nav>
);
