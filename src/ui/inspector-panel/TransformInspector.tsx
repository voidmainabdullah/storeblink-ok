import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  FlipHorizontal2,
  FlipVertical2,
  Ratio,
  RotateCcw,
} from "lucide-react";
import type { SceneNode, TransformData } from "@/types";
import {
  InspectorIconButton,
  InspectorSection,
  NumberField,
  SegmentedControl,
} from "./InspectorControls";

export type TransformInspectorProps = {
  node: SceneNode;
  parent: SceneNode | null;
  breakpointLabel: string;
  onUpdateTransform: (patch: Partial<TransformData>) => void;
  onUpdateProps: (patch: Record<string, unknown>) => void;
  onUpdateExtensions: (patch: Record<string, unknown>) => void;
};

const safeRatio = (node: SceneNode) =>
  node.transform.height > 0 ? node.transform.width / node.transform.height : 1;

export const TransformInspector = ({
  node,
  parent,
  breakpointLabel,
  onUpdateTransform,
  onUpdateProps,
  onUpdateExtensions,
}: TransformInspectorProps) => {
  const aspectRequired = node.extensions?.aspectRatioRequired === true;
  const aspectLocked =
    aspectRequired || node.extensions?.aspectRatioLocked === true;
  const aspectRatio = Math.max(
    0.0001,
    Number(node.extensions?.aspectRatio ?? safeRatio(node)),
  );
  const parentWidth = parent?.transform.width ?? node.transform.width;
  const parentHeight = parent?.transform.height ?? node.transform.height;

  const alignX = (mode: "start" | "center" | "end") => {
    const x =
      mode === "start"
        ? 0
        : mode === "center"
          ? (parentWidth - node.transform.width) / 2
          : parentWidth - node.transform.width;
    onUpdateTransform({ x });
  };

  const alignY = (mode: "start" | "center" | "end") => {
    const y =
      mode === "start"
        ? 0
        : mode === "center"
          ? (parentHeight - node.transform.height) / 2
          : parentHeight - node.transform.height;
    onUpdateTransform({ y });
  };

  const updateWidth = (width: number) => {
    const safeWidth = Math.max(1, width);
    onUpdateTransform(
      aspectLocked
        ? { width: safeWidth, height: Math.max(1, safeWidth / aspectRatio) }
        : { width: safeWidth },
    );
  };

  const updateHeight = (height: number) => {
    const safeHeight = Math.max(1, height);
    onUpdateTransform(
      aspectLocked
        ? { height: safeHeight, width: Math.max(1, safeHeight * aspectRatio) }
        : { height: safeHeight },
    );
  };

  return (
    <>
      <InspectorSection
        title="Position"
        actions={<span className="text-[8px] font-medium text-[#70bfff]">{breakpointLabel}</span>}
      >
        <div>
          <div className="mb-1 text-[9px] font-medium text-[#a6a6a6]">Alignment</div>
          <div className="grid grid-cols-6 gap-1 rounded bg-[#242424] p-1">
            <InspectorIconButton icon={AlignHorizontalJustifyStart} title="Align left" onClick={() => alignX("start")} />
            <InspectorIconButton icon={AlignHorizontalJustifyCenter} title="Align horizontal center" onClick={() => alignX("center")} />
            <InspectorIconButton icon={AlignHorizontalJustifyEnd} title="Align right" onClick={() => alignX("end")} />
            <InspectorIconButton icon={AlignVerticalJustifyStart} title="Align top" onClick={() => alignY("start")} />
            <InspectorIconButton icon={AlignVerticalJustifyCenter} title="Align vertical center" onClick={() => alignY("center")} />
            <InspectorIconButton icon={AlignVerticalJustifyEnd} title="Align bottom" onClick={() => alignY("end")} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={node.transform.x} onCommit={(x) => onUpdateTransform({ x })} />
          <NumberField label="Y" value={node.transform.y} onCommit={(y) => onUpdateTransform({ y })} />
        </div>
        <div>
          <div className="mb-1 text-[9px] font-medium text-[#a6a6a6]">Rotation</div>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1">
            <NumberField
              label="Angle"
              value={node.transform.rotation}
              onCommit={(rotation) => onUpdateTransform({ rotation })}
              suffix="deg"
            />
            <InspectorIconButton
              icon={FlipHorizontal2}
              title="Flip horizontal"
              onClick={() => onUpdateTransform({ scaleX: node.transform.scaleX === 0 ? -1 : -node.transform.scaleX })}
              className="mt-4"
            />
            <InspectorIconButton
              icon={FlipVertical2}
              title="Flip vertical"
              onClick={() => onUpdateTransform({ scaleY: node.transform.scaleY === 0 ? -1 : -node.transform.scaleY })}
              className="mt-4"
            />
            <InspectorIconButton
              icon={RotateCcw}
              title="Reset rotation and flips"
              onClick={() => onUpdateTransform({
                rotation: 0,
                scaleX: Math.abs(node.transform.scaleX) || 1,
                scaleY: Math.abs(node.transform.scaleY) || 1,
              })}
              className="mt-4"
            />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="Layout">
        {node.type === "text" ? (
          <SegmentedControl
            label="Resizing"
            value={String(node.props.textResizeMode ?? "fixed")}
            options={[
              { value: "auto-width", label: "Auto width" },
              { value: "auto-height", label: "Auto height" },
              { value: "fixed", label: "Fixed" },
            ]}
            onChange={(textResizeMode) => onUpdateProps({ textResizeMode })}
          />
        ) : null}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9px] font-medium text-[#a6a6a6]">Dimensions</span>
            <InspectorIconButton
              icon={Ratio}
              active={aspectLocked}
              disabled={aspectRequired}
              title={
                aspectRequired
                  ? "This element preserves its aspect ratio"
                  : aspectLocked
                    ? "Unlock aspect ratio"
                    : "Lock aspect ratio"
              }
              onClick={() =>
                onUpdateExtensions({
                  aspectRatioLocked: !aspectLocked,
                  aspectRatio: safeRatio(node),
                })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="W" value={node.transform.width} min={1} onCommit={updateWidth} />
            <NumberField label="H" value={node.transform.height} min={1} onCommit={updateHeight} />
          </div>
        </div>
      </InspectorSection>
    </>
  );
};
