import { useState, type CSSProperties } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  MoreHorizontal,
  Palette as PaletteIcon,
  Strikethrough,
  Underline,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownRow } from "@/editor/components/primitives/EditorDropdown";
import { FigmaColorPicker } from "@/editor/components/toolbars/FigmaColorPicker";
import { FONT_MAP, type ElementStyle } from "@/lib/storeTheme";

// ============ Floating Canva-style text-format toolbar ============
export const RichTextQuickBar = ({
  fixedAnchor, tag, style,
  onToggleBold, onToggleItalic, onToggleUnderline, onToggleStrike, onToggleUppercase,
  onSetAlign, onSetList, onSetFontSize, onSetFontFamily, onSetColor,
  effectId, onSetEffect, effects, isActive,
}: {
  fixedAnchor: { x: number; y: number } | null;
  tag?: string;
  style: ElementStyle;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onToggleUnderline: () => void;
  onToggleStrike: () => void;
  onToggleUppercase: () => void;
  onSetAlign: (v: "left" | "center" | "right" | "justify") => void;
  onSetList: (v: "disc" | "decimal" | "none") => void;
  onSetFontSize: (v: number) => void;
  onSetFontFamily: (v: string) => void;
  onSetColor: (v: string) => void;
  effectId: string;
  onSetEffect: (id: string) => void;
  effects: { id: string; label: string; value?: string }[];
  isActive: (key: string, val: any) => boolean;
}) => {
  const [showEffects, setShowEffects] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const bold = (style.fontWeight ?? 400) >= 600;
  const fontStyle: CSSProperties = fixedAnchor
    ? { position: "fixed", left: fixedAnchor.x, top: Math.max(8, fixedAnchor.y - 46), transform: "translateX(-50%)", zIndex: 55 }
    : { position: "relative" };

  const Bar = (
    <div
      style={fontStyle}
      className="sb-editor-floating flex items-center gap-0.5 rounded-lg border px-1 py-1"
    >
      <Select value={style.fontFamily || "Inter"} onValueChange={onSetFontFamily}>
        <SelectTrigger className="h-7 w-[110px] text-[11px] border-0 bg-transparent"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.keys(FONT_MAP).map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="mx-0.5 h-5 w-px bg-border" />
      <input
        type="number"
        value={style.fontSize ?? 16}
        onChange={(e) => onSetFontSize(Number(e.target.value) || 16)}
        className="h-7 w-11 text-[11px] text-center bg-transparent outline-none"
      />
      <div className="mx-0.5 h-5 w-px bg-border" />
      <FigmaColorPicker value={style.color || "#171A1F"} label="Text color" onChange={onSetColor} />
      <div className="mx-0.5 h-5 w-px bg-border" />
      <button onClick={onToggleBold} className={`h-7 w-7 grid place-items-center rounded ${bold ? "bg-foreground text-background" : "hover:bg-muted"}`}><Bold size={12} /></button>
      <button onClick={onToggleItalic} className={`h-7 w-7 grid place-items-center rounded ${isActive("fontStyle", "italic") ? "bg-foreground text-background" : "hover:bg-muted"}`}><Italic size={12} /></button>
      <button onClick={onToggleUnderline} className={`h-7 w-7 grid place-items-center rounded ${isActive("textDecoration", "underline") ? "bg-foreground text-background" : "hover:bg-muted"}`}><Underline size={12} /></button>
      <div className="mx-0.5 h-5 w-px bg-border" />
      <button onClick={() => onSetAlign("left")} className="h-7 w-7 grid place-items-center rounded hover:bg-muted"><AlignLeft size={12} /></button>
      <button onClick={() => onSetAlign("center")} className="h-7 w-7 grid place-items-center rounded hover:bg-muted"><AlignCenter size={12} /></button>
      <button onClick={() => onSetAlign("right")} className="h-7 w-7 grid place-items-center rounded hover:bg-muted"><AlignRight size={12} /></button>
      <div className="mx-0.5 h-5 w-px bg-border" />
      <button onClick={() => onSetList("disc")} className={`h-7 w-7 grid place-items-center rounded ${isActive("listStyleType", "disc") ? "bg-foreground text-background" : "hover:bg-muted"}`}><List size={12} /></button>
      <button onClick={() => onSetList("decimal")} className={`h-7 w-7 grid place-items-center rounded ${isActive("listStyleType", "decimal") ? "bg-foreground text-background" : "hover:bg-muted"}`}><ListOrdered size={12} /></button>
      <div className="mx-0.5 h-5 w-px bg-border" />
      <div className="relative">
        <button onClick={() => { setShowEffects((v) => !v); setShowMore(false); }} className={`h-7 w-7 grid place-items-center rounded ${effectId !== "none" ? "bg-foreground text-background" : "hover:bg-muted"}`}>
          <PaletteIcon size={12} />
        </button>
        {showEffects && (
          <div className="absolute top-full mt-1 right-0 w-36 rounded-lg border border-border bg-background shadow-xl py-1 z-10">
            {effects.map((eff) => (
              <button key={eff.id} onClick={() => { onSetEffect(eff.id); setShowEffects(false); }} className={`w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-muted ${effectId === eff.id ? "font-semibold" : ""}`}>
                {eff.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="relative">
        <button onClick={() => { setShowMore((v) => !v); setShowEffects(false); }} className="h-7 w-7 grid place-items-center rounded hover:bg-muted">
          <MoreHorizontal size={12} />
        </button>
        {showMore && (
          <div className="absolute top-full mt-1 right-0 w-40 rounded-lg border border-border bg-background shadow-xl py-1 z-10">
            <DropdownRow icon={Strikethrough} label="Strikethrough" onClick={() => { onToggleStrike(); setShowMore(false); }} />
            <DropdownRow icon={AlignJustify} label="Justify" onClick={() => { onSetAlign("justify"); setShowMore(false); }} />
            <DropdownRow label="UPPERCASE" onClick={() => { onToggleUppercase(); setShowMore(false); }} />
            <DropdownRow icon={List} label="Clear list" onClick={() => { onSetList("none"); setShowMore(false); }} />
          </div>
        )}
      </div>
    </div>
  );

  if (fixedAnchor) return Bar;
  // Fallback (no rect reported by the storefront yet): dock inline instead of floating.
  return <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20">{Bar}</div>;
};

