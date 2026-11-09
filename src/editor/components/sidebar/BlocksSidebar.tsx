import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Frame,
  GripVertical,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  PanelLeftOpen,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { TemplatePreview } from "@/components/store/TemplatePreview";
import { TEMPLATES, type StoreTemplate } from "@/components/store/templates";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SECTION_LABELS, type OverlayImage, type SectionKey, type TextOverlay } from "@/lib/storeTheme";

type SidebarMode = "layers" | "templates" | "features";

const RailButton = ({ tip, active, onClick, children }: { tip: string; active?: boolean; onClick: () => void; children: ReactNode }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        onClick={onClick}
        className={`group flex h-[58px] w-[58px] flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium transition-colors ${
          active ? "sb-editor-active" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
        }`}
      >
        {children}
        <span className="leading-none">{tip}</span>
      </button>
    </TooltipTrigger>
    <TooltipContent side="right" className="text-xs">{tip}</TooltipContent>
  </Tooltip>
);

const LayerRow = ({
  depth = 0,
  icon,
  label,
  active,
  muted,
  onClick,
}: {
  depth?: number;
  icon?: ReactNode;
  label: string;
  active?: boolean;
  muted?: boolean;
  onClick?: () => void;
}) => (
  <button
    onClick={onClick}
    className={`flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[11px] transition-colors hover:bg-white/10 ${
      active ? "bg-white/10 text-white" : muted ? "text-[#a8a8a8]" : "text-[#f0f0f0]"
    }`}
    style={{ paddingLeft: 8 + depth * 14 }}
  >
    <span className="grid h-4 w-4 shrink-0 place-items-center text-[#8f8f8f]">{icon}</span>
    <span className="min-w-0 flex-1 truncate">{label}</span>
  </button>
);

const AgentPopup = ({ onClose }: { onClose: () => void }) => (
  <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/35 pt-20" onMouseDown={onClose}>
    <div
      className="relative w-[360px] rounded-md bg-[#2c2c2c] p-6 text-white shadow-2xl"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button onClick={onClose} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded text-[#b8b8b8] hover:bg-white/10 hover:text-white">
        <X size={16} />
      </button>
      <div className="relative mb-6 h-[132px] overflow-hidden rounded bg-[#c2fbff]">
        <div className="absolute left-0 top-8 h-[90px] w-[196px] rounded-tr-xl bg-[#087333] p-3 text-[12px] font-semibold text-white">
          <div className="mb-3 h-3 w-20 rounded bg-[#d7ff9d]" />
          <div>Your bookshelves</div>
          <div className="mt-5 flex gap-1">
            {["Fantasy", "Mystery", "Romance", "Sci-Fi"].map((item) => (
              <span key={item} className="rounded bg-white/15 px-2 py-1 text-[8px]">{item}</span>
            ))}
          </div>
        </div>
        <div className="absolute left-4 top-3 text-[10px] font-semibold text-[#111]">9:41</div>
        <div className="absolute right-[98px] top-18 grid h-8 w-8 place-items-center rounded-lg bg-[#168bff] text-xl font-bold text-white shadow-lg">+</div>
        <div className="absolute right-[72px] top-[58px] h-12 w-8 rotate-[-25deg] rounded-sm bg-white shadow-xl" style={{ clipPath: "polygon(0 0, 100% 55%, 42% 66%, 28% 100%)" }} />
      </div>
      <div className="text-[20px] font-bold leading-tight">Designers, meet your Figma agent</div>
      <p className="mt-4 text-[13px] font-semibold leading-6 text-[#eeeeee]">
        With the Professional plan, you can prompt Figma's agent to generate design directions, make bulk edits, apply your design system, and more.
      </p>
      <button className="mt-6 h-9 w-full rounded bg-[#0178ff] text-[12px] font-bold text-white">Upgrade to Professional</button>
      <button className="mt-5 h-8 w-full text-center text-[12px] font-bold text-white">Learn more</button>
      <div className="mt-5 text-center text-[11px] font-semibold text-[#b8b8b8]">Starter plans will get limited access soon.</div>
    </div>
  </div>
);

export const BlocksSidebar = ({
  open, width = 256, onToggle,
  sectionOrder, sections, activeSection, onReorderSections, onToggleSection, onFocusSection,
  existingBlocks, existingOverlays, existingHeroTexts,
  onSelectBlock, editableElements, onSelectElement,
  onOpenRightTab, showHelp, onToggleHelp,
  storeName = "ElevenLabs - AI Audio...",
  currentTemplate = "minimal",
  onSelectTemplate,
}: {
  open: boolean;
  width?: number;
  onToggle: () => void;
  sectionOrder: SectionKey[];
  sections: Record<SectionKey, boolean>;
  activeSection: SectionKey | null;
  onReorderSections: (order: SectionKey[]) => void;
  onToggleSection: (section: SectionKey) => void;
  onFocusSection: (section: SectionKey) => void;
  onAddHeroText: () => void;
  onAddOverlayImage: (section: SectionKey) => void;
  onAddBlock: (kind: import("@/lib/storeTheme").CustomBlockKind, section: SectionKey) => void;
  existingBlocks: import("@/lib/storeTheme").CustomBlock[];
  existingOverlays: OverlayImage[];
  existingHeroTexts: TextOverlay[];
  onSelectBlock: (bid: string) => void;
  editableElements: { id: string; label: string; tag?: string; replaceable?: boolean }[];
  onSelectElement: (el: { id: string; label: string; tag?: string; replaceable?: boolean }) => void;
  onOpenRightTab: (tab: string) => void;
  onFocusAI: () => void;
  showHelp: boolean;
  onToggleHelp: () => void;
  storeName?: string;
  currentTemplate?: StoreTemplate;
  storeColor?: string;
  onSelectTemplate?: (template: StoreTemplate) => void;
}) => {
  const [mode, setMode] = useState<SidebarMode>("layers");
  const [query, setQuery] = useState("");
  const [agentOpen, setAgentOpen] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();

  const filteredElements = useMemo(
    () => editableElements.filter((element) => !normalizedQuery || `${element.label} ${element.id} ${element.tag ?? ""}`.toLowerCase().includes(normalizedQuery)),
    [editableElements, normalizedQuery],
  );
  const filteredBlocks = useMemo(
    () => existingBlocks.filter((block) => !normalizedQuery || `${block.kind} ${block.props.text ?? ""} ${SECTION_LABELS[block.section]}`.toLowerCase().includes(normalizedQuery)),
    [existingBlocks, normalizedQuery],
  );

  const featureItems = [
    ["Monochrome pixel art", "By Figma", "bg-lime-700"],
    ["Texturize", "By Figma", "bg-green-700"],
    ["Chromatic metal", "By Figma", "bg-slate-500"],
    ["Chart builder", "By Figma", "bg-pink-500"],
    ["DreamUI: AI UI Generator, D...", "279", "bg-indigo-700"],
    ["Nebula", "By Figma", "bg-black"],
    ["Gradient map", "By Figma", "bg-emerald-500"],
    ["3D-to-2D perspective", "By Figma", "bg-orange-500"],
    ["Shader Studio", "By Figma", "bg-teal-900"],
    ["Change aspect ratio", "By Figma", "bg-sky-900"],
    ["Warp", "By Figma", "bg-zinc-400"],
    ["DateStamp", "116k", "bg-violet-700"],
  ];

  const renderRail = () => (
    <div className="sb-editor-rail relative border-r flex flex-col items-center py-3 gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link to="/dashboard" className="group flex h-[58px] w-[58px] flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
            <ArrowLeft size={16} />
            <span className="leading-none">Back</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">Back to dashboard</TooltipContent>
      </Tooltip>
      <RailButton tip="Layers" active={mode === "layers"} onClick={() => setMode("layers")}><Layers size={16} /></RailButton>
      <RailButton tip="Agents" active={agentOpen} onClick={() => setAgentOpen(true)}><Sparkles size={16} /></RailButton>
      <RailButton tip="Template" active={mode === "templates"} onClick={() => setMode("templates")}><BookOpen size={16} /></RailButton>
      <RailButton tip="Feature" active={mode === "features"} onClick={() => setMode("features")}><Wrench size={16} /></RailButton>
      <div className="flex-1" />
      <RailButton tip="Vars" onClick={() => onOpenRightTab("design")}><Settings2 size={16} /></RailButton>
      <RailButton tip="Help" active={showHelp} onClick={onToggleHelp}><HelpCircle size={16} /></RailButton>
      {showHelp && (
        <div className="absolute left-[74px] bottom-2 z-40 w-64 rounded-md border border-[#3c3c3c] bg-[#2c2c2c] p-3 text-[11px] text-white shadow-2xl">
          <div className="mb-2 font-semibold">Keyboard shortcuts</div>
          {["Ctrl+K Command palette", "Ctrl+Z Undo", "Ctrl+D Duplicate", "Delete Remove", "Esc Deselect"].map((row) => <div key={row} className="py-1 text-[#b8b8b8]">{row}</div>)}
        </div>
      )}
    </div>
  );

  if (!open) {
    return (
      <>
        <aside className="sb-editor-rail shrink-0 border-r flex flex-col items-center py-3 gap-2">
          <Link to="/dashboard" className="h-10 w-10 grid place-items-center rounded-lg hover:bg-white/5 text-muted-foreground"><ArrowLeft size={16} /></Link>
          <button onClick={onToggle} className="h-10 w-10 grid place-items-center rounded-lg hover:bg-white/5 text-muted-foreground"><PanelLeftOpen size={16} /></button>
        </aside>
        {agentOpen && <AgentPopup onClose={() => setAgentOpen(false)} />}
      </>
    );
  }

  return (
    <div className="shrink-0 flex">
      {renderRail()}
      <aside style={{ width }} className="sb-editor-panel shrink-0 border-r flex flex-col overflow-hidden bg-[#2c2c2c] text-white">
        {mode === "layers" && (
          <>
            <div className="border-b border-[#3c3c3c] px-2 py-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-bold">{storeName}</div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-[#b8b8b8]">
                    <span>Drafts</span>
                    <span className="rounded bg-[#23446b] px-1.5 py-0.5 text-[10px] font-bold text-[#9fd2ff]">Free</span>
                  </div>
                </div>
                <button onClick={onToggle} className="grid h-7 w-7 place-items-center rounded hover:bg-white/10 text-[#b8b8b8]">[]</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="border-b border-[#3c3c3c] px-2 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[11px] font-bold">Pages</div>
                  <div className="flex items-center gap-1 text-[#b8b8b8]"><Search size={13} /><Plus size={14} /></div>
                </div>
                <LayerRow icon={<span className="text-[13px]">🔥</span>} label="Replicated UI" active onClick={() => onFocusSection(activeSection ?? "hero")} />
                <LayerRow icon={<FileText size={12} />} label="Page 3" />
                <LayerRow icon={<FileText size={12} />} label="Page 4" />
                <LayerRow icon={<span className="h-3 w-3 rounded-sm bg-red-500" />} label="Cover" />
              </div>
              <div className="px-2 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[11px] font-bold">Layers</div>
                  <GripVertical size={13} className="text-[#8f8f8f]" />
                </div>
                <div className="mb-2 relative">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#8f8f8f]" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search layers" className="h-8 w-full rounded border border-[#0178ff] bg-[#333] pl-7 pr-2 text-[11px] outline-none placeholder:text-[#8f8f8f]" />
                </div>
                {sectionOrder.map((section) => (
                  <div key={section}>
                    <LayerRow
                      icon={sections[section] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      label={SECTION_LABELS[section]}
                      active={activeSection === section}
                      onClick={() => onFocusSection(section)}
                    />
                  </div>
                ))}
                {filteredBlocks.map((block) => (
                  <LayerRow key={block.id} depth={1} icon={<Frame size={12} />} label={block.props.text || block.kind} onClick={() => onSelectBlock(block.id)} />
                ))}
                {existingHeroTexts.map((text) => (
                  <LayerRow key={text.id} depth={1} icon={<FileText size={12} />} label={text.text || "Hero text"} muted />
                ))}
                {existingOverlays.map((overlay) => (
                  <LayerRow key={overlay.id} depth={1} icon={<ImageIcon size={12} />} label={`Overlay - ${SECTION_LABELS[overlay.section]}`} muted />
                ))}
                {filteredElements.map((element) => (
                  <LayerRow key={element.id} depth={1} icon={<ImageIcon size={12} />} label={element.label || element.id} onClick={() => onSelectElement(element)} />
                ))}
              </div>
            </div>
          </>
        )}

        {mode === "templates" && (
          <div className="flex-1 overflow-y-auto px-2 py-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[13px] font-bold">Templates</div>
              <BookOpen size={14} className="text-[#d8d8d8]" />
            </div>
            <div className="relative mb-3">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#8f8f8f]" />
              <input placeholder="Search all libraries" className="h-8 w-full rounded border border-[#0178ff] bg-[#333] pl-7 pr-8 text-[11px] outline-none placeholder:text-[#8f8f8f]" />
              <SlidersHorizontal size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#b8b8b8]" />
            </div>
            <div className="mb-3 text-[11px] font-bold">All libraries</div>
            <div className="space-y-5">
              {TEMPLATES.map((template, index) => (
                <button key={template.id} onClick={() => onSelectTemplate?.(template.id)} className="w-full text-left">
                  <div className={`overflow-hidden rounded ${currentTemplate === template.id ? "ring-2 ring-[#0178ff]" : ""}`}>
                    <TemplatePreview id={template.preview} color={index % 2 ? "#ad62ff" : "#d1bd9a"} />
                  </div>
                  <div className="mt-2 text-[12px] font-bold">{template.name} Design Kit</div>
                  <div className="text-[11px] text-[#b8b8b8]">{index === 0 ? "173" : index === 1 ? "357" : "1844"} components</div>
                </button>
              ))}
            </div>
            <button className="mt-4 h-8 w-full rounded border border-[#4a4a4a] text-[11px] font-bold text-white">Add more libraries</button>
          </div>
        )}

        {mode === "features" && (
          <div className="flex-1 overflow-y-auto px-2 py-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[13px] font-bold">Features</div>
              <button className="h-7 rounded border border-[#4a4a4a] px-2 text-[11px] font-bold">Create <ChevronDown size={11} className="inline" /></button>
            </div>
            <div className="relative mb-3">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#8f8f8f]" />
              <input placeholder="Search all tools" className="h-8 w-full rounded border border-[#0178ff] bg-[#333] pl-7 pr-8 text-[11px] outline-none placeholder:text-[#8f8f8f]" />
              <SlidersHorizontal size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#b8b8b8]" />
            </div>
            <div className="mb-4 flex gap-2">
              <button className="h-7 rounded border border-[#4a4a4a] px-2 text-[11px]">Source <ChevronDown size={11} className="inline" /></button>
              <button className="h-7 rounded border border-[#4a4a4a] px-2 text-[11px]">Category <ChevronDown size={11} className="inline" /></button>
            </div>
            <div className="mb-2 text-[11px] font-bold text-[#b8b8b8]">Suggested</div>
            <div className="space-y-3">
              {featureItems.map(([title, meta, color]) => (
                <button key={title} className="flex w-full items-center gap-2 text-left">
                  <span className={`h-9 w-9 shrink-0 rounded ${color}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-bold">{title}</span>
                    <span className="block truncate text-[11px] text-[#b8b8b8]">{meta}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
      {agentOpen && <AgentPopup onClose={() => setAgentOpen(false)} />}
    </div>
  );
};
