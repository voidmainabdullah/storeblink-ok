import { memo } from "react";
import { mobileMenuAnimationRegistry } from "./MobileMenuAnimationRegistry";
import type { ThemeChromeSettings } from "./types";

export type ThemeMobileMenuStylesProps = {
  settings: ThemeChromeSettings;
};

export const ThemeMobileMenuStyles = memo(({
  settings,
}: ThemeMobileMenuStylesProps) => {
  const animation = mobileMenuAnimationRegistry.get(settings.mobileMenu.animation);
  const breakpoint = Math.round(settings.mobileMenu.breakpoint);
  return (
    <style>{`
      [data-theme-menu-root] [data-theme-chrome-slot="mobile-menu"]{
        transition:opacity 180ms ease,translate 220ms cubic-bezier(.2,.8,.2,1),scale 180ms ease,visibility 180ms;
        transform-origin:top right;
        will-change:opacity,translate,scale;
        max-width:100vw;
        max-height:calc(100dvh - 8px);
        overflow-x:hidden!important;
        overflow-y:auto!important;
        overscroll-behavior:contain;
        z-index:1000!important;
      }
      [data-theme-menu-root][data-theme-menu-open="true"] [data-canonical-section="site-header"]{
        z-index:1000!important;
      }
      [data-theme-menu-root] [data-mobile-menu-presentation="drawer"]{
        position:fixed!important;
        inset:0 0 0 auto!important;
        transform:none!important;
        width:min(88vw,380px)!important;
        height:100dvh!important;
        max-height:100dvh!important;
      }
      [data-theme-menu-root] [data-mobile-menu-presentation="dropdown"]{
        position:absolute!important;
        inset:100% 0 auto 0!important;
        transform:none!important;
        width:100%!important;
      }
      [data-theme-menu-root] [data-mobile-menu-presentation="fullscreen"]{
        position:fixed!important;
        inset:0!important;
        transform:none!important;
        width:100vw!important;
        height:100dvh!important;
        max-height:100dvh!important;
      }
      [data-theme-menu-root] [data-mobile-menu-presentation="dropdown"]{
        max-height:min(70dvh,640px);
      }
      [data-theme-menu-root][data-theme-menu-open="false"] [data-theme-chrome-slot="mobile-menu"]{
        opacity:0!important;
        visibility:hidden!important;
        pointer-events:none!important;
        translate:${animation.closedTranslate};
        scale:${animation.closedScale};
      }
      [data-theme-menu-root][data-theme-menu-open="true"] [data-theme-chrome-slot="mobile-menu"]{
        opacity:1!important;
        visibility:visible!important;
        pointer-events:auto!important;
        translate:0 0;
        scale:1;
        box-shadow:0 0 0 100vmax rgba(0,0,0,.28),0 24px 56px rgba(0,0,0,.24)!important;
      }
      [data-theme-menu-morph] [data-menu-line]{
        position:absolute;
        left:0;
        transition:transform 180ms ease,opacity 140ms ease,top 180ms ease;
      }
      [data-theme-menu-morph] [data-menu-line="top"]{top:24%}
      [data-theme-menu-morph] [data-menu-line="middle"]{top:50%;transform:translateY(-50%)}
      [data-theme-menu-morph] [data-menu-line="bottom"]{top:76%}
      [data-theme-menu-morph][data-theme-menu-icon-kind="minimal-two-line"] [data-menu-line="top"]{top:32%}
      [data-theme-menu-morph][data-theme-menu-icon-kind="minimal-two-line"] [data-menu-line="bottom"]{top:68%}
      [data-theme-menu-root][data-theme-menu-open="true"] [data-menu-line="top"]{
        top:50%;transform:translateY(-50%) rotate(45deg)
      }
      [data-theme-menu-root][data-theme-menu-open="true"] [data-menu-line="middle"]{
        opacity:0;transform:scaleX(.2)
      }
      [data-theme-menu-root][data-theme-menu-open="true"] [data-menu-line="bottom"]{
        top:50%;transform:translateY(-50%) rotate(-45deg)
      }
      @media (max-width:${breakpoint}px){
        [data-theme-primary-nav]{display:none!important}
        [data-theme-menu-trigger-shell]{display:inline-flex!important}
      }
      @media (min-width:${breakpoint + 1}px){
        [data-theme-menu-trigger-shell]{display:none!important}
        [data-theme-secondary-mobile-menu]{display:none!important}
      }
      @media (prefers-reduced-motion:reduce){
        [data-theme-menu-root] [data-theme-chrome-slot="mobile-menu"],
        [data-theme-menu-morph] [data-menu-line]{transition:none!important}
      }
    `}</style>
  );
});

ThemeMobileMenuStyles.displayName = "ThemeMobileMenuStyles";
