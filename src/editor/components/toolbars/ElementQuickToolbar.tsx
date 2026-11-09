import type { CSSProperties } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ClipboardPaste,
  Copy,
  Crop,
  ImagePlus,
  Layers,
  Lock,
  MoreHorizontal,
  Palette as PaletteIcon,
  Trash2,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FigmaColorPicker } from "@/editor/components/toolbars/FigmaColorPicker";

// ============ Floating element quick-actions pill ============
export const ElementQuickToolbar = ({
  fixedAnchor, locked, isBlock, fillColor, textColor, strokeColor,
  onSetFill, onSetTextColor, onSetStroke, onReplace, onCrop,
  onDuplicate, onCopy, onCopyStyle, onPasteStyle, onToggleLock, onBringFront, onSendBack, onDelete, onMore,
}: {
  fixedAnchor: { x: number; y: number } | null;
  locked: boolean;
  isBlock: boolean;
  fillColor?: string;
  textColor?: string;
  strokeColor?: string;
  onSetFill?: (value: string) => void;
  onSetTextColor?: (value: string) => void;
  onSetStroke?: (value: string) => void;
  onReplace?: () => void;
  onCrop?: () => void;
  onDuplicate?: () => void;
  onCopy: () => void;
  onCopyStyle: () => void;
  onPasteStyle: () => void;
  onToggleLock: () => void;
  onBringFront: () => void;
  onSendBack: () => void;
  onDelete: () => void;
  onMore: (clientX: number, clientY: number) => void;
}) => {
  const posStyle: CSSProperties = fixedAnchor
    ? { position: "fixed", left: fixedAnchor.x, top: Math.max(8, fixedAnchor.y - 42), transform: "translateX(-50%)", zIndex: 55 }
    : { position: "relative" };
  const Bar = (
    <div style={posStyle} className="sb-editor-floating flex items-center gap-0.5 rounded-lg border px-1 py-1">
      {onSetFill && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div><FigmaColorPicker value={fillColor || "#FFFFFF"} label="Fill color" onChange={onSetFill} align="left" /></div>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Fill color</TooltipContent>
        </Tooltip>
      )}
      {onSetTextColor && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div><FigmaColorPicker value={textColor || "#171A1F"} label="Text color" onChange={onSetTextColor} align="left" /></div>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Text color</TooltipContent>
        </Tooltip>
      )}
      {onSetStroke && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div><FigmaColorPicker value={strokeColor || "#171A1F"} label="Stroke color" onChange={onSetStroke} align="left" /></div>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Stroke color</TooltipContent>
        </Tooltip>
      )}
      {(onSetFill || onSetTextColor || onSetStroke) && <div className="mx-0.5 h-5 w-px bg-border" />}
      {onReplace && (
        <Tooltip><TooltipTrigger asChild><button onClick={onReplace} className="h-7 w-7 grid place-items-center rounded hover:bg-muted"><ImagePlus size={12} /></button></TooltipTrigger><TooltipContent className="text-xs">Replace media</TooltipContent></Tooltip>
      )}
      {onCrop && (
        <Tooltip><TooltipTrigger asChild><button onClick={onCrop} className="h-7 w-7 grid place-items-center rounded hover:bg-muted"><Crop size={12} /></button></TooltipTrigger><TooltipContent className="text-xs">Crop</TooltipContent></Tooltip>
      )}
      {(onReplace || onCrop) && <div className="mx-0.5 h-5 w-px bg-border" />}
      {onDuplicate && (
        <Tooltip><TooltipTrigger asChild><button onClick={onDuplicate} className="h-7 w-7 grid place-items-center rounded hover:bg-muted"><Layers size={12} /></button></TooltipTrigger><TooltipContent className="text-xs">Duplicate</TooltipContent></Tooltip>
      )}
      <Tooltip><TooltipTrigger asChild><button onClick={onCopy} disabled={!isBlock} className="h-7 w-7 grid place-items-center rounded hover:bg-muted disabled:opacity-30"><Copy size={12} /></button></TooltipTrigger><TooltipContent className="text-xs">Copy</TooltipContent></Tooltip>
      <Tooltip><TooltipTrigger asChild><button onClick={onCopyStyle} className="h-7 w-7 grid place-items-center rounded hover:bg-muted"><PaletteIcon size={12} /></button></TooltipTrigger><TooltipContent className="text-xs">Copy style</TooltipContent></Tooltip>
      <Tooltip><TooltipTrigger asChild><button onClick={onPasteStyle} className="h-7 w-7 grid place-items-center rounded hover:bg-muted"><ClipboardPaste size={12} /></button></TooltipTrigger><TooltipContent className="text-xs">Paste style</TooltipContent></Tooltip>
      <div className="mx-0.5 h-5 w-px bg-border" />
      <Tooltip><TooltipTrigger asChild><button onClick={onBringFront} className="h-7 w-7 grid place-items-center rounded hover:bg-muted"><ArrowUpToLine size={12} /></button></TooltipTrigger><TooltipContent className="text-xs">Bring to front</TooltipContent></Tooltip>
      <Tooltip><TooltipTrigger asChild><button onClick={onSendBack} className="h-7 w-7 grid place-items-center rounded hover:bg-muted"><ArrowDownToLine size={12} /></button></TooltipTrigger><TooltipContent className="text-xs">Send to back</TooltipContent></Tooltip>
      <div className="mx-0.5 h-5 w-px bg-border" />
      <Tooltip><TooltipTrigger asChild><button onClick={onToggleLock} className={`h-7 w-7 grid place-items-center rounded ${locked ? "bg-amber-500/20 text-red-700" : "hover:bg-muted"}`}><Lock size={12} /></button></TooltipTrigger><TooltipContent className="text-xs">{locked ? "Unlock" : "Lock"}</TooltipContent></Tooltip>
      <Tooltip><TooltipTrigger asChild><button onClick={onDelete} className="h-7 w-7 grid place-items-center rounded hover:bg-destructive/10 text-destructive"><Trash2 size={12} /></button></TooltipTrigger><TooltipContent className="text-xs">Delete</TooltipContent></Tooltip>
      <div className="mx-0.5 h-5 w-px bg-border" />
      <Tooltip><TooltipTrigger asChild><button onClick={(e) => onMore(e.clientX, e.clientY)} className="h-7 w-7 grid place-items-center rounded hover:bg-muted"><MoreHorizontal size={12} /></button></TooltipTrigger><TooltipContent className="text-xs">More actions</TooltipContent></Tooltip>
    </div>
  );
  if (fixedAnchor) return Bar;
  return <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20">{Bar}</div>;
};

