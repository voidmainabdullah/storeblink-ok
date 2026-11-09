import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getNodeDomId, getNodeFrameStyle, useSceneRenderContext } from "@/rendering/renderer";
import {
  CUSTOM_CODE_FRAME_DOCUMENT,
  CUSTOM_CODE_STOREFRONT_ACTION_EVENT,
  parseCustomCodeProps,
  type CustomCodeStorefrontActionDetail,
} from "@/extension/custom-code";
import { useDynamicSourceData } from "@/document/dynamic-sources";
import type { SceneNode } from "@/types";

type CustomCodeMessage = {
  scope?: unknown;
  token?: unknown;
  type?: unknown;
  message?: unknown;
  path?: unknown;
  action?: unknown;
  productId?: unknown;
  quantity?: unknown;
};

const createFrameToken = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const CustomCodeRenderer = memo(({ node }: { node: SceneNode }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const tokenRef = useRef(createFrameToken());
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const { interactionPreviewEnabled } = useSceneRenderContext();
  const dynamicData = useDynamicSourceData();
  const props = useMemo(() => parseCustomCodeProps(node.props), [node.props]);
  const runtimeData = useMemo(() => ({
    products: dynamicData.products ?? [],
    store: dynamicData.store ?? null,
    currency: dynamicData.currency ?? "USD",
    custom: props.data ?? {},
  }), [dynamicData.currency, dynamicData.products, dynamicData.store, props.data]);

  const sendRender = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage({
      scope: "storeblink-custom-code-host",
      token: tokenRef.current,
      compiledJs: props.compiledJs,
      css: props.css,
      data: runtimeData,
    }, "*");
  }, [props.compiledJs, props.css, runtimeData]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<CustomCodeMessage>) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = event.data;
      if (
        message?.scope !== "storeblink-custom-code" ||
        message.token !== tokenRef.current
      ) return;
      if (message.type === "error" && typeof message.message === "string") {
        setRuntimeError(message.message.slice(0, 500));
        return;
      }
      if (message.type === "rendered") {
        setRuntimeError(null);
        return;
      }
      if (
        message.type === "navigate" &&
        !interactionPreviewEnabled &&
        typeof message.path === "string" &&
        message.path.length <= 2048 &&
        (/^\/(?!\/)/.test(message.path) || /^#[a-zA-Z0-9_-]+$/.test(message.path))
      ) {
        window.location.assign(message.path);
        return;
      }
      if (message.type === "action" && !interactionPreviewEnabled) {
        const action = message.action;
        if (!["add-to-cart", "open-cart", "view-product"].includes(String(action))) return;
        const productId = typeof message.productId === "string"
          ? message.productId.trim().slice(0, 128)
          : undefined;
        if ((action === "add-to-cart" || action === "view-product") && !productId) return;
        const quantity = Math.min(99, Math.max(1, Math.floor(Number(message.quantity ?? 1))));
        const detail: CustomCodeStorefrontActionDetail = {
          nodeId: node.id,
          action: action as CustomCodeStorefrontActionDetail["action"],
          ...(productId ? { productId } : {}),
          ...(action === "add-to-cart" ? { quantity } : {}),
        };
        window.dispatchEvent(new CustomEvent(CUSTOM_CODE_STOREFRONT_ACTION_EVENT, { detail }));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [interactionPreviewEnabled, node.id]);

  useEffect(() => {
    sendRender();
  }, [sendRender]);

  return (
    <div
      id={getNodeDomId(node)}
      data-node-id={node.id}
      data-node-type={node.type}
      style={{ ...getNodeFrameStyle(node), overflow: "hidden" }}
    >
      <iframe
        ref={frameRef}
        title={props.title ?? node.name}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        loading="lazy"
        srcDoc={CUSTOM_CODE_FRAME_DOCUMENT}
        onLoad={sendRender}
        tabIndex={interactionPreviewEnabled ? -1 : 0}
        style={{
          width: "100%",
          height: "100%",
          border: 0,
          display: "block",
          background: "transparent",
          pointerEvents: interactionPreviewEnabled ? "none" : "auto",
        }}
      />
      {runtimeError ? (
        <div
          role="alert"
          style={{
            position: "absolute",
            inset: "auto 8px 8px",
            padding: "8px 10px",
            borderRadius: 4,
            background: "#7f1d1d",
            color: "#ffffff",
            font: "12px/1.4 ui-monospace, monospace",
            pointerEvents: "none",
          }}
        >
          {runtimeError}
        </div>
      ) : null}
    </div>
  );
});

CustomCodeRenderer.displayName = "CustomCodeRenderer";
