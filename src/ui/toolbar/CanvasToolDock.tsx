import {
  ArrowRight,
  Circle,
  Code2,
  Diamond,
  Grid3X3,
  Hand,
  Hexagon,
  ImagePlus,
  Minus,
  MousePointer2,
  Square,
  Star,
  Triangle,
  Type,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import type { ReactNode } from "react";
import type { EditorTool } from "@/stores/tool.store";

export type ShapePreset = "rectangle" | "circle" | "ellipse" | "triangle" | "line" | "arrow" | "star" | "polygon" | "diamond";
export type TextPreset = "heading" | "subheading" | "paragraph";

type DockButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

const DockButton = ({ label, active, disabled, onClick, children }: DockButtonProps) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={active}
    title={label}
    disabled={disabled}
    onClick={onClick}
    className={`grid h-8 w-8 shrink-0 place-items-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
      active ? "bg-[#0178ff] text-white" : "text-[#d8d8d8] hover:bg-white/10 hover:text-white"
    }`}
  >
    {children}
  </button>
);

export type CanvasToolDockProps = {
  activeTool: EditorTool;
  gridVisible: boolean;
  zoom: number;
  onSelectTool: (tool: EditorTool) => void;
  onInsertText: (preset: TextPreset) => void;
  onInsertShape: (preset: ShapePreset) => void;
  onUploadImage: (file: File) => void;
  onInsertCode?: () => void;
  onToggleGrid: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  insertEnabled?: boolean;
};

export const CanvasToolDock = ({
  activeTool,
  gridVisible,
  zoom,
  onSelectTool,
  onInsertText,
  onInsertShape,
  onUploadImage,
  onInsertCode,
  onToggleGrid,
  onZoomOut,
  onZoomIn,
  insertEnabled = true,
}: CanvasToolDockProps) => {
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [textMenuOpen, setTextMenuOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const shapePresets: Array<{ id: ShapePreset; label: string; icon: ReactNode }> = [
    { id: "rectangle", label: "Rectangle", icon: <Square size={16} /> },
    { id: "circle", label: "Circle", icon: <Circle size={16} /> },
    { id: "ellipse", label: "Ellipse", icon: <span className="block h-3 w-5 rounded-[50%] border border-current" /> },
    { id: "triangle", label: "Triangle", icon: <Triangle size={16} /> },
    { id: "line", label: "Line", icon: <Minus size={17} /> },
    { id: "arrow", label: "Arrow", icon: <ArrowRight size={17} /> },
    { id: "star", label: "Star", icon: <Star size={16} /> },
    { id: "polygon", label: "Polygon", icon: <Hexagon size={16} /> },
    { id: "diamond", label: "Diamond", icon: <Diamond size={16} /> },
  ];
  const textPresets: Array<{ id: TextPreset; label: string; sample: string }> = [
    { id: "heading", label: "Heading", sample: "32 px / Bold" },
    { id: "subheading", label: "Subheading", sample: "22 px / Semibold" },
    { id: "paragraph", label: "Paragraph", sample: "16 px / Regular" },
  ];

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onUploadImage(file);
  };

  return (
    <div
      data-editor-tool-dock
      className="absolute bottom-4 left-1/2 z-50 flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-1 rounded-md border border-white/10 bg-[#2c2c2c] p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.36)]"
    >
    <DockButton label="Pointer tool (V)" active={activeTool === "select"} onClick={() => onSelectTool("select")}>
      <MousePointer2 size={16} />
    </DockButton>
    <DockButton label="Hand tool (H)" active={activeTool === "hand"} onClick={() => onSelectTool("hand")}>
      <Hand size={16} />
    </DockButton>
    <div className="mx-1 h-6 w-px shrink-0 bg-[#4b4b4b]" />
    <DockButton label={gridVisible ? "Hide grid" : "Show grid"} active={gridVisible} onClick={onToggleGrid}>
      <Grid3X3 size={16} />
    </DockButton>
      {insertEnabled ? <div className="relative">
        <DockButton
          label="Add shape"
          active={shapeMenuOpen}
          onClick={() => {
            setShapeMenuOpen((open) => !open);
            setTextMenuOpen(false);
          }}
        >
          <Square size={16} />
        </DockButton>
        {shapeMenuOpen ? (
          <div className="absolute bottom-full left-0 mb-2 grid w-[238px] grid-cols-3 gap-1 rounded-md border border-[#494949] bg-[#2c2c2c] p-2 shadow-2xl">
            {shapePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  onInsertShape(preset.id);
                  setShapeMenuOpen(false);
                }}
                className="flex h-16 flex-col items-center justify-center gap-1 rounded text-[10px] text-[#d8d8d8] hover:bg-white/10 hover:text-white"
              >
                {preset.icon}
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div> : null}
      {insertEnabled ? <div className="relative">
        <DockButton
          label="Add text"
          active={textMenuOpen}
          onClick={() => {
            setTextMenuOpen((open) => !open);
            setShapeMenuOpen(false);
          }}
        >
          <Type size={16} />
        </DockButton>
        {textMenuOpen ? (
          <div className="absolute bottom-full left-0 mb-2 w-[210px] rounded-md border border-[#494949] bg-[#2c2c2c] p-2 shadow-2xl">
            {textPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  onInsertText(preset.id);
                  setTextMenuOpen(false);
                }}
                className="flex h-11 w-full items-center justify-between rounded px-2 text-left hover:bg-white/10"
              >
                <span className="text-xs font-semibold text-white">{preset.label}</span>
                <span className="text-[9px] text-[#9a9a9a]">{preset.sample}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div> : null}
      {insertEnabled ? <DockButton label="Upload image" onClick={() => imageInputRef.current?.click()}>
        <ImagePlus size={16} />
      </DockButton> : null}
      {insertEnabled && onInsertCode ? (
        <DockButton label="Add custom React code" onClick={onInsertCode}>
          <Code2 size={16} />
        </DockButton>
      ) : null}
      <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />
    <div className="mx-1 h-6 w-px shrink-0 bg-[#4b4b4b]" />
    <DockButton label="Zoom out" disabled={zoom <= 0.1} onClick={onZoomOut}>
      <ZoomOut size={16} />
    </DockButton>
    <span className="w-11 shrink-0 text-center text-[11px] tabular-nums text-[#e4e4e4]">
      {Math.round(zoom * 100)}%
    </span>
    <DockButton label="Zoom in" disabled={zoom >= 4} onClick={onZoomIn}>
      <ZoomIn size={16} />
    </DockButton>
    </div>
  );
};
