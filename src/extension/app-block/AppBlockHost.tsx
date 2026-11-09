import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppBlockFrameMessage,
  ExtensionGrant,
  ThirdPartyExtensionManifest,
} from "./contracts";
import {
  ExtensionSecurityPolicy,
  createAppBlockDataProjection,
  type AppBlockDataSource,
} from "./ExtensionSecurityPolicy";
import {
  AppBlockSession,
  createAppBlockSessionToken,
} from "./AppBlockSession";
import { createAppBlockFrameDocument } from "./AppBlockFrameDocument";

export type MediatedAppBlockAction = AppBlockFrameMessage & Readonly<{
  type: "frame:action";
  action: "add-to-cart" | "open-cart" | "view-product" | "navigate";
  productId: string | null;
  quantity: number | null;
  path: string | null;
}>;

export type AppBlockHostProps = Readonly<{
  manifest: ThirdPartyExtensionManifest;
  grant: ExtensionGrant;
  blockId: string;
  data: AppBlockDataSource;
  onAction(action: MediatedAppBlockAction): void;
  onError?(message: string): void;
}>;

export const AppBlockHost = ({
  manifest,
  grant,
  blockId,
  data,
  onAction,
  onError,
}: AppBlockHostProps) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const tokenRef = useRef<string | null>(null);
  if (tokenRef.current === null) tokenRef.current = createAppBlockSessionToken();
  const token = tokenRef.current;
  const [failure, setFailure] = useState<string | null>(null);

  const prepared = useMemo(() => {
    try {
      const trusted = new ExtensionSecurityPolicy().assertDiscoverable(manifest, grant);
      if (!trusted.grant) throw new Error("App block requires an active grant.");
      const block = trusted.manifest.appBlocks.find((entry) => entry.id === blockId);
      if (!block) throw new Error(`App block ${blockId} is not declared.`);
      const projection = createAppBlockDataProjection(
        data,
        trusted.grant.grantedCapabilities,
        trusted.grant.quotas.maxDataBytes,
      );
      const session = new AppBlockSession({ token, block, grant: trusted.grant });
      return {
        block,
        projection,
        session,
        document: createAppBlockFrameDocument(token),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "App block is unavailable." };
    }
  }, [blockId, data, grant, manifest, token]);

  const sendInit = useCallback(() => {
    if ("error" in prepared) return;
    try {
      frameRef.current?.contentWindow?.postMessage(
        prepared.session.createInit(prepared.projection),
        "*",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "App block could not initialize.";
      setFailure(message);
      onError?.(message);
    }
  }, [onError, prepared]);

  useEffect(() => {
    if ("error" in prepared) {
      setFailure(prepared.error);
      onError?.(prepared.error);
      return;
    }
    const onMessage = (event: MessageEvent<unknown>) => {
      const result = prepared.session.handleMessage(
        event.data,
        event.source === frameRef.current?.contentWindow,
      );
      if (!result.accepted) return;
      if (result.type === "frame:ready") {
        sendInit();
        return;
      }
      if (result.type === "frame:error") {
        const message = (result.message as AppBlockFrameMessage & { message: string }).message;
        setFailure(message);
        onError?.(message);
        return;
      }
      if (result.type === "frame:action") {
        onAction(result.message as MediatedAppBlockAction);
        return;
      }
      if (result.type === "frame:resize" && frameRef.current) {
        const { height } = result.message as AppBlockFrameMessage & { height: number };
        frameRef.current.style.height = `${height}px`;
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      prepared.session.revoke();
      window.removeEventListener("message", onMessage);
    };
  }, [onAction, onError, prepared, sendInit]);

  if ("error" in prepared || failure) {
    return <div role="status" data-app-block-state="unavailable">App block unavailable</div>;
  }

  return (
    <iframe
      ref={frameRef}
      title={prepared.block.view.ariaLabel}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      loading="lazy"
      srcDoc={prepared.document}
      onLoad={sendInit}
      data-app-block-id={prepared.block.id}
      style={{ width: "100%", minHeight: 80, border: 0, display: "block" }}
    />
  );
};
