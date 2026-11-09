import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  Crop,
  Download,
  ImagePlus,
  RotateCcw,
  ScanLine,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FigmaColorPicker } from "@/editor/components/toolbars/FigmaColorPicker";
import {
  DEFAULT_IMAGE_ADJUSTMENTS,
  DEFAULT_IMAGE_EFFECTS,
  readImageAdjustments,
  readImageEffects,
  type ImageAdjustments,
  type ImageEffects,
} from "@/elements/image/imageAdjustments";
import type { SceneNode } from "@/types";
import {
  InspectorSection,
  NumberField,
  RangeField,
  SelectField,
  ToggleRow,
} from "./InspectorControls";
import {
  exportImageNode,
  type ImageExportFormat,
  type ImageExportOptions,
} from "./imageExport";

export type ImageInspectorProps = {
  node: SceneNode;
  brandColors: string[];
  onUpdateProps: (patch: Record<string, unknown>) => void;
  onUploadImage?: (file: File) => Promise<void>;
  onRemoveBackground?: (node: SceneNode) => Promise<string>;
  onEnhance?: (node: SceneNode) => Promise<string>;
  appearanceBefore?: ReactNode;
  strokeEffectsAfter?: ReactNode;
  replaceOnly?: boolean;
};

const adjustmentRanges: Array<{
  key: keyof ImageAdjustments;
  label: string;
  min: number;
  max: number;
}> = [
  { key: "exposure", label: "Exposure", min: -100, max: 100 },
  { key: "brightness", label: "Brightness", min: -100, max: 100 },
  { key: "contrast", label: "Contrast", min: -100, max: 100 },
  { key: "saturation", label: "Saturation", min: -100, max: 100 },
  { key: "vibrance", label: "Vibrance", min: -100, max: 100 },
  { key: "temperature", label: "Temperature", min: -100, max: 100 },
  { key: "tint", label: "Tint", min: -100, max: 100 },
  { key: "blur", label: "Blur", min: 0, max: 40 },
  { key: "sharpness", label: "Sharpness", min: 0, max: 100 },
];

export const ImageInspector = ({
  node,
  brandColors,
  onUpdateProps,
  onUploadImage,
  onRemoveBackground,
  onEnhance,
  appearanceBefore,
  strokeEffectsAfter,
  replaceOnly = false,
}: ImageInspectorProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState<"remove" | "enhance" | null>(null);
  const [status, setStatus] = useState("");
  const [exportOptions, setExportOptions] = useState<ImageExportOptions>({
    format: "png",
    scale: 1,
    quality: 92,
    transparent: true,
  });
  const adjustments = readImageAdjustments(node.props.imageAdjustments);
  const effects = readImageEffects(node.props.imageEffects);
  const positionX = Math.max(0, Math.min(100, Number(node.props.imagePositionX ?? 50)));
  const positionY = Math.max(0, Math.min(100, Number(node.props.imagePositionY ?? 50)));

  const replaceImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onUploadImage) return;
    setProcessing("enhance");
    setStatus("Uploading image...");
    void onUploadImage(file)
      .then(() => setStatus("Image replaced"))
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Image upload failed"))
      .finally(() => setProcessing(null));
  };

  const updateAdjustments = (patch: Partial<ImageAdjustments>) =>
    onUpdateProps({ imageAdjustments: { ...adjustments, ...patch } });

  const updateEffects = (patch: Partial<ImageEffects>) =>
    onUpdateProps({ imageEffects: { ...effects, ...patch } });

  const updatePosition = (axis: "x" | "y", value: number) => {
    const nextX = axis === "x" ? value : positionX;
    const nextY = axis === "y" ? value : positionY;
    onUpdateProps({
      imagePositionX: nextX,
      imagePositionY: nextY,
      objectPosition: `${nextX}% ${nextY}%`,
    });
  };

  const runProcessor = async (
    kind: "remove" | "enhance",
    processor: ((node: SceneNode) => Promise<string>) | undefined,
  ) => {
    if (!processor) return;
    setProcessing(kind);
    setStatus("");
    try {
      const src = await processor(node);
      onUpdateProps({ src });
      setStatus(kind === "remove" ? "Background removed" : "Image enhanced");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Image processing failed");
    } finally {
      setProcessing(null);
    }
  };

  const runExport = async () => {
    setStatus("Exporting...");
    try {
      await exportImageNode(node, exportOptions);
      setStatus("Export ready");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed");
    }
  };

  return (
    <>
      {appearanceBefore}
      <InspectorSection title="Image">
        <Button
          variant="outline"
          className="h-8 w-full border-[#4a4a4a] bg-transparent text-[10px] text-white hover:bg-white/10"
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus size={13} className="mr-2" /> Replace image
        </Button>
        <input ref={inputRef} type="file" accept="image/*" onChange={replaceImage} className="hidden" />
        {replaceOnly ? (
          <div className="rounded border border-[#444] bg-[#262626] px-2 py-2 text-[10px] leading-4 text-[#aaa]">
            Fixed mode preserves the image frame and layout while replacing its source.
          </div>
        ) : null}
        {!replaceOnly ? <SelectField
          label="Fill mode"
          value={String(node.props.objectFit ?? "cover")}
          options={[
            { value: "cover", label: "Cover" },
            { value: "contain", label: "Contain" },
            { value: "fill", label: "Stretch" },
            { value: "none", label: "Original size" },
            { value: "scale-down", label: "Scale down" },
          ]}
          onChange={(objectFit) => onUpdateProps({ objectFit })}
        /> : null}
        {!replaceOnly ? <ToggleRow
          label="Crop"
          checked={node.props.cropEnabled === true}
          description="Use scale and position to choose the visible image area."
          onChange={(cropEnabled) => onUpdateProps({
            cropEnabled,
            ...(cropEnabled ? { objectFit: "cover" } : {}),
          })}
        /> : null}
        {!replaceOnly ? <RangeField
          label="Scale"
          value={Number(node.props.imageScale ?? 100)}
          min={10}
          max={400}
          onChange={(imageScale) => onUpdateProps({ imageScale })}
        /> : null}
        {!replaceOnly ? <div className="grid grid-cols-2 gap-2">
          <NumberField label="Position X" value={positionX} min={0} max={100} suffix="%" onCommit={(value) => updatePosition("x", value)} />
          <NumberField label="Position Y" value={positionY} min={0} max={100} suffix="%" onCommit={(value) => updatePosition("y", value)} />
        </div> : null}
        {!replaceOnly ? <RangeField label="Image opacity" value={adjustments.opacity} min={0} max={100} onChange={(opacity) => updateAdjustments({ opacity })} /> : null}
        {!replaceOnly ? adjustmentRanges.map((field) => (
          <RangeField
            key={field.key}
            label={field.label}
            value={adjustments[field.key]}
            min={field.min}
            max={field.max}
            onChange={(value) => updateAdjustments({ [field.key]: value })}
          />
        )) : null}
        {!replaceOnly ? <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={!onRemoveBackground || Boolean(processing)}
            title={onRemoveBackground ? "Remove image background" : "Configure an image-processing provider to enable background removal"}
            className="h-8 border-[#4a4a4a] bg-transparent px-2 text-[9px] text-white hover:bg-white/10"
            onClick={() => runProcessor("remove", onRemoveBackground)}
          >
            <ScanLine size={12} className="mr-1.5" /> Remove BG
          </Button>
          <Button
            variant="outline"
            disabled={!onEnhance || Boolean(processing)}
            title={onEnhance ? "Enhance image" : "Configure an image-processing provider to enable AI enhancement"}
            className="h-8 border-[#4a4a4a] bg-transparent px-2 text-[9px] text-white hover:bg-white/10"
            onClick={() => runProcessor("enhance", onEnhance)}
          >
            <Sparkles size={12} className="mr-1.5" /> AI enhance
          </Button>
        </div> : null}
        {!replaceOnly ? <Button
          variant="ghost"
          className="h-7 w-full text-[9px] text-[#bbb] hover:bg-white/10 hover:text-white"
          onClick={() => onUpdateProps({
            imageAdjustments: DEFAULT_IMAGE_ADJUSTMENTS,
            imageEffects: DEFAULT_IMAGE_EFFECTS,
            imageScale: 100,
            imagePositionX: 50,
            imagePositionY: 50,
            objectPosition: "50% 50%",
            cropEnabled: false,
          })}
        >
          <RotateCcw size={12} className="mr-1.5" /> Reset image
        </Button> : null}
        {status ? <div role="status" className="text-[9px] text-[#aaa]">{status}</div> : null}
      </InspectorSection>

      {!replaceOnly ? strokeEffectsAfter : null}

      {!replaceOnly ? <InspectorSection title="Image effects" defaultOpen={false}>
        <RangeField label="Noise" value={effects.noise} min={0} max={100} onChange={(noise) => updateEffects({ noise })} />
        <RangeField label="Texture" value={effects.texture} min={0} max={100} onChange={(texture) => updateEffects({ texture })} />
        <RangeField label="Glass" value={effects.glass} min={0} max={100} onChange={(glass) => updateEffects({ glass })} />
        <RangeField label="Glow" value={effects.glow} min={0} max={100} onChange={(glow) => updateEffects({ glow })} />
        <div className="flex items-center justify-between rounded bg-[#383838] px-2 py-1">
          <span className="text-[10px] text-[#ddd]">Glow color</span>
          <FigmaColorPicker
            value={effects.glowColor}
            label="Glow color"
            brandColors={brandColors}
            onChange={(glowColor) => updateEffects({ glowColor })}
          />
        </div>
        <SelectField
          label="Blend mode"
          value={String(effects.blendMode ?? "normal")}
          options={[
            { value: "normal", label: "Normal" },
            { value: "multiply", label: "Multiply" },
            { value: "screen", label: "Screen" },
            { value: "overlay", label: "Overlay" },
            { value: "darken", label: "Darken" },
            { value: "lighten", label: "Lighten" },
            { value: "color-dodge", label: "Color dodge" },
            { value: "color-burn", label: "Color burn" },
            { value: "difference", label: "Difference" },
          ]}
          onChange={(blendMode) => updateEffects({ blendMode: blendMode as ImageEffects["blendMode"] })}
        />
      </InspectorSection> : null}

      {!replaceOnly ? <InspectorSection title="Export" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label="Format"
            value={exportOptions.format}
            options={[
              { value: "png", label: "PNG" },
              { value: "jpeg", label: "JPG" },
              { value: "webp", label: "WebP" },
            ]}
            onChange={(format) => setExportOptions((current) => ({ ...current, format: format as ImageExportFormat }))}
          />
          <NumberField
            label="Scale"
            value={exportOptions.scale}
            min={0.25}
            max={4}
            step={0.25}
            suffix="x"
            onCommit={(scale) => setExportOptions((current) => ({ ...current, scale }))}
          />
        </div>
        <RangeField
          label="Quality"
          value={exportOptions.quality}
          min={10}
          max={100}
          onChange={(quality) => setExportOptions((current) => ({ ...current, quality }))}
        />
        <ToggleRow
          label="Transparent background"
          checked={exportOptions.transparent}
          onChange={(transparent) => setExportOptions((current) => ({ ...current, transparent }))}
        />
        <Button className="h-8 w-full bg-[#0178ff] text-[10px] text-white hover:bg-[#0b87df]" onClick={runExport}>
          <Download size={13} className="mr-2" /> Export image
        </Button>
      </InspectorSection>
      : null}
    </>
  );
};
