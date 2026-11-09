import { memo, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import { assetSystem, getAssetSource, type AssetSystem } from "@/assets/system/AssetSystem";
import type { AssetManager } from "@/assets/system/AssetManager";
import { createSceneReplaceCommand, type CommandManager } from "@/engine/command";
import { EDITOR_SYSTEM_KEYS } from "@/engine/kernel/systemKeys";
import { useOptionalEngineContext } from "@/engine/kernel/useEngine";
import type { SceneGraphAPI } from "@/engine/scene-graph";
import type { SceneNode } from "@/types";
import { getNodeDomId, getNodeFrameStyle } from "@/rendering/renderer/style";
import { useSceneRenderContext } from "@/rendering/renderer/SceneRenderProvider";
import { responsiveSystem, type ResponsiveSystem } from "@/layout/responsive";
import {
  themeChromeNodeSlot,
  themeLogoPresentationForScene,
} from "@/theme-engine/chrome";
import {
  getImageChannelTransfer,
  getImageFilterId,
  getImageSaturation,
  hasImageFilter,
  readImageAdjustments,
  readImageEffects,
} from "./imageAdjustments";

const OBJECT_FIT_VALUES = new Set(["contain", "cover", "fill", "none", "scale-down"]);

export type ImageRendererProps = {
  node: SceneNode;
};

export const ImageRenderer = memo(({ node }: ImageRendererProps) => {
  const engineContext = useOptionalEngineContext();
  const renderContext = useSceneRenderContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const responsive = engineContext?.tryResolveSystem<ResponsiveSystem>(EDITOR_SYSTEM_KEYS.responsive) ?? responsiveSystem;
  const assets = engineContext?.tryResolveSystem<AssetSystem>(EDITOR_SYSTEM_KEYS.assets) ?? assetSystem;
  const assetManager = engineContext?.tryResolveSystem<AssetManager>(EDITOR_SYSTEM_KEYS.assetManager);
  const commands = engineContext?.tryResolveSystem<CommandManager>(EDITOR_SYSTEM_KEYS.commands);
  const chromeSlot = themeChromeNodeSlot(node);
  const logoPresentation = useMemo(
    () =>
      chromeSlot === "logo" && renderContext.scene
        ? themeLogoPresentationForScene(
            renderContext.scene,
            renderContext.breakpoint ?? responsive.getActiveBreakpoint(),
          )
        : null,
    [chromeSlot, renderContext.breakpoint, renderContext.scene, responsive],
  );
  const sceneAsset = useMemo(
    () => renderContext.scene
      ? assets.getImage(
          renderContext.scene,
          typeof node.props.assetId === "string" ? node.props.assetId : null,
        )
      : null,
    [assets, node.props.assetId, renderContext.scene],
  );
  const src =
    logoPresentation?.src ??
    getAssetSource(sceneAsset) ??
    (typeof node.props.src === "string" ? node.props.src : undefined);
  const alt =
    logoPresentation?.alt ??
    (typeof node.props.alt === "string" ? node.props.alt : node.name);
  const requestedObjectFit = typeof node.props.objectFit === "string" ? node.props.objectFit : "";
  const objectFit =
    chromeSlot === "logo"
      ? "contain"
      : OBJECT_FIT_VALUES.has(requestedObjectFit)
        ? requestedObjectFit as "contain" | "cover" | "fill" | "none" | "scale-down"
        : "cover";
  const imagePositionX = Math.max(0, Math.min(100, Number(node.props.imagePositionX ?? 50)));
  const imagePositionY = Math.max(0, Math.min(100, Number(node.props.imagePositionY ?? 50)));
  const hasImagePositionOverride =
    Object.prototype.hasOwnProperty.call(node.props, "imagePositionX") ||
    Object.prototype.hasOwnProperty.call(node.props, "imagePositionY");
  const objectPosition =
    logoPresentation?.objectPosition ??
    (!hasImagePositionOverride && typeof node.props.objectPosition === "string"
      ? node.props.objectPosition
      : `${imagePositionX}% ${imagePositionY}%`);
  const imageScale = Math.max(10, Math.min(400, Number(node.props.imageScale ?? 100))) / 100;
  const logoPadding = Math.max(
    0,
    Math.min(
      128,
      logoPresentation?.padding ?? Number(node.props.logoPadding ?? 0),
    ),
  );
  const adjustments = readImageAdjustments(node.props.imageAdjustments);
  const imageEffects = readImageEffects(node.props.imageEffects);
  const filterId = getImageFilterId(node.id);
  const transfer = getImageChannelTransfer(adjustments);
  const saturation = getImageSaturation(adjustments);
  const filterEnabled = hasImageFilter(adjustments, imageEffects);
  const sharpness = adjustments.sharpness / 100;
  const imageFilter = [
    filterEnabled ? `url(#${filterId})` : "",
    imageEffects.glow > 0
      ? `drop-shadow(0 0 ${Math.max(1, imageEffects.glow / 5)}px ${imageEffects.glowColor})`
      : "",
  ].filter(Boolean).join(" ");
  const commandGraph = useMemo(
    () => engineContext?.tryResolveSystem<SceneGraphAPI>(EDITOR_SYSTEM_KEYS.commandSceneGraph),
    [engineContext],
  );

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  const stopEditorGesture = (event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const updateImageSource = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !commandGraph || !commands || !assetManager) return;
    setUploadError(null);
    // A node-level replacement must not retire a shared asset that may still be
    // referenced by another node or breakpoint.
    const upload = assetManager.uploadImage({
      file,
      altText: String(node.props.alt ?? file.name),
    });
    void upload
      .then((result) => {
        const before = commandGraph.serializeTree();
        const after = assets.upsertImage(before, result.sceneAsset);
        const target = after.nodes[node.id];
        if (!target) throw new Error("The image node no longer exists.");
        const { src: _legacySource, ...retainedProps } = target.props;
        target.props = {
          ...retainedProps,
          assetId: result.asset.id,
          srcSet: result.srcSet || undefined,
          sizes: target.props.sizes ?? "(max-width: 640px) 100vw, 50vw",
          alt: target.props.alt ?? result.sceneAsset.altText,
          objectFit,
        };
        target.meta = { ...target.meta, updatedAt: Date.now() };
        commands.dispatch(createSceneReplaceCommand(before, after, `Replace ${node.name}`), {
          sceneGraph: commandGraph,
        });
        setImageFailed(false);
      })
      .catch((error: unknown) => {
        setUploadError(error instanceof Error ? error.message : "The image could not be imported.");
      });
  };

  return (
    <div
      id={getNodeDomId(node)}
      data-node-id={node.id}
      data-node-type={node.type}
      data-theme-chrome-slot={themeChromeNodeSlot(node) ?? undefined}
      data-image-empty={!src || imageFailed ? "true" : undefined}
      data-image-broken={imageFailed ? "true" : undefined}
      onPointerEnter={() => setShowUploader(true)}
      onPointerLeave={() => setShowUploader(false)}
      style={{
        ...getNodeFrameStyle(node),
        overflow: "hidden",
        ...(imageEffects.glass > 0
          ? {
              backdropFilter: `blur(${Math.max(1, imageEffects.glass / 8)}px) saturate(1.2)`,
              background: "rgba(255,255,255,0.12)",
            }
          : {}),
        ...((!src || imageFailed) && !node.style.fills.length ? { background: "#e5e7eb" } : {}),
      }}
    >
      {filterEnabled ? (
        <svg
          width="0"
          height="0"
          aria-hidden="true"
          focusable="false"
          style={{ position: "absolute", pointerEvents: "none" }}
        >
          <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
            <feComponentTransfer in="SourceGraphic" result="channels">
              <feFuncR type="linear" slope={transfer.r.slope} intercept={transfer.r.intercept} />
              <feFuncG type="linear" slope={transfer.g.slope} intercept={transfer.g.intercept} />
              <feFuncB type="linear" slope={transfer.b.slope} intercept={transfer.b.intercept} />
              <feFuncA type="identity" />
            </feComponentTransfer>
            <feColorMatrix in="channels" type="saturate" values={String(saturation)} result="saturated" />
            <feConvolveMatrix
              in="saturated"
              order="3"
              kernelMatrix={`0 ${-sharpness} 0 ${-sharpness} ${1 + sharpness * 4} ${-sharpness} 0 ${-sharpness} 0`}
              preserveAlpha="true"
              result="sharpened"
            />
            {adjustments.blur > 0 ? (
              <feGaussianBlur in="sharpened" stdDeviation={adjustments.blur} result="softened" />
            ) : null}
            {imageEffects.noise > 0 ? (
              <>
                <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" seed="7" result="noise" />
                <feColorMatrix
                  in="noise"
                  type="matrix"
                  values={`1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${imageEffects.noise / 500} 0`}
                  result="noise-alpha"
                />
                <feBlend
                  in={adjustments.blur > 0 ? "softened" : "sharpened"}
                  in2="noise-alpha"
                  mode="overlay"
                  result="with-noise"
                />
              </>
            ) : null}
            {imageEffects.texture > 0 ? (
              <>
                <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed="13" result="texture" />
                <feColorMatrix
                  in="texture"
                  type="matrix"
                  values={`0.45 0 0 0 0 0 0.4 0 0 0 0 0 0.35 0 0 0 0 0 ${imageEffects.texture / 600} 0`}
                  result="texture-alpha"
                />
                <feBlend
                  in={imageEffects.noise > 0 ? "with-noise" : adjustments.blur > 0 ? "softened" : "sharpened"}
                  in2="texture-alpha"
                  mode="multiply"
                />
              </>
            ) : null}
          </filter>
        </svg>
      ) : null}
      {src && !imageFailed ? (
        <img
          src={src}
          srcSet={typeof node.props.srcSet === "string" ? node.props.srcSet : undefined}
          sizes={typeof node.props.sizes === "string" ? node.props.sizes : undefined}
          alt={alt}
          loading={node.props.loading === "eager" ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onError={() => setImageFailed(true)}
          style={{
            width: "100%",
            height: "100%",
             objectFit,
             objectPosition,
             boxSizing: "border-box",
             padding: logoPadding || undefined,
            opacity: adjustments.opacity / 100,
            transform: imageScale === 1 ? undefined : `scale(${imageScale})`,
            transformOrigin: `${imagePositionX}% ${imagePositionY}%`,
            filter: imageFilter || undefined,
            mixBlendMode: imageEffects.blendMode,
          }}
        />
      ) : null}
      {imageFailed && !commandGraph ? (
        <div
          role="img"
          aria-label={`${alt} is unavailable`}
          style={{
            display: "grid",
            width: "100%",
            height: "100%",
            placeItems: "center",
            padding: 16,
            color: "#6b7280",
            background: "#f3f4f6",
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 12,
            textAlign: "center",
          }}
        >
          Image unavailable
        </div>
      ) : null}
      {(!src || imageFailed) && commandGraph ? (
        <>
          <button
            type="button"
            onPointerDown={stopEditorGesture}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              inputRef.current?.click();
            }}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              height: 30,
              minWidth: 88,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.72)",
              background: "rgba(0,0,0,0.54)",
              color: "#fff",
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: 11,
              fontWeight: 700,
              opacity: showUploader ? 1 : 0,
              pointerEvents: showUploader ? "auto" : "none",
              transition: "opacity 120ms ease",
              cursor: "pointer",
              zIndex: 3,
            }}
          >
            Add image
          </button>
          <input ref={inputRef} type="file" accept="image/*" onChange={updateImageSource} style={{ display: "none" }} />
        </>
      ) : null}
      {uploadError ? (
        <div
          role="alert"
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            maxWidth: "calc(100% - 16px)",
            padding: "6px 8px",
            borderRadius: 4,
            background: "rgba(127, 29, 29, 0.92)",
            color: "#ffffff",
            fontSize: 11,
            lineHeight: 1.3,
            pointerEvents: "none",
          }}
        >
          {uploadError}
        </div>
      ) : null}
    </div>
  );
});

ImageRenderer.displayName = "ImageRenderer";
