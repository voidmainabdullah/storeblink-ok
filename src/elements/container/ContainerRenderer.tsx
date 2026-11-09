import { memo } from "react";
import type { SceneNode } from "@/types";
import { getNodeDomId, getNodeFrameStyle, renderChildren } from "@/rendering/renderer";
import {
  themeChromeNodeSlot,
  themeMobileMenuDomId,
  useThemeMobileMenuRuntime,
} from "@/theme-engine/chrome";

export type ContainerRendererProps = {
  node: SceneNode;
};

export const ContainerRenderer = memo(({ node }: ContainerRendererProps) => {
  const chromeSlot = themeChromeNodeSlot(node);
  const mobileMenu = chromeSlot === "mobile-menu";
  const mobileMenuRuntime = useThemeMobileMenuRuntime();
  return (
    <div
      id={mobileMenu ? themeMobileMenuDomId(node.id) : getNodeDomId(node)}
      data-node-id={node.id}
      data-node-type={node.type}
      data-theme-chrome-slot={chromeSlot ?? undefined}
      data-mobile-menu-presentation={
        mobileMenu ? String(node.props.mobileMenuPresentation ?? "drawer") : undefined
      }
      role={mobileMenu ? "navigation" : undefined}
      aria-label={mobileMenu ? String(node.props.ariaLabel ?? "Store navigation") : undefined}
      aria-hidden={mobileMenu && mobileMenuRuntime ? !mobileMenuRuntime.open : undefined}
      tabIndex={mobileMenu ? -1 : undefined}
      style={{ ...getNodeFrameStyle(node), overflow: String(node.props.overflow ?? "visible") }}
    >
      {renderChildren(node)}
    </div>
  );
});

ContainerRenderer.displayName = "ContainerRenderer";
