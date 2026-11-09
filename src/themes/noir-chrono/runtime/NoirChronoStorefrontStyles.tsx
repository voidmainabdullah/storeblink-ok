import { memo } from "react";

export const NoirChronoStorefrontStyles = memo(() => (
  <style>{`
    [data-noir-storefront]{background:#f7f7f5;color:#111}
    [data-noir-storefront] [data-storefront-chrome="header"]{
      border-color:rgba(255,255,255,.12)!important;
      background:rgba(16,16,16,.96)!important;
      color:#f7f7f5;
      box-shadow:0 10px 30px rgba(0,0,0,.16);
    }
    [data-noir-storefront] [data-storefront-chrome="header"] [data-theme-primary-nav]{
      border-color:rgba(255,255,255,.14)!important;
      background:rgba(255,255,255,.06)!important;
    }
    [data-noir-storefront] [data-storefront-chrome="header"] [data-theme-primary-nav] a{color:#d7d4d1!important}
    [data-noir-storefront] [data-storefront-chrome="header"] [data-theme-primary-nav] a:hover{
      background:rgba(255,255,255,.1)!important;color:#fff!important
    }
    [data-noir-storefront] [data-storefront-chrome="header"] [data-theme-primary-nav] a[aria-current="page"]{
      background:#f7f7f5!important;color:#111!important
    }
    [data-noir-storefront] [data-storefront-chrome="header"] > div a,
    [data-noir-storefront] [data-storefront-chrome="header"] > div button{
      border-color:rgba(255,255,255,.16)!important;color:#f7f7f5
    }
    [data-noir-storefront] [data-storefront-chrome="header"] [data-public-brand-name]{color:#f7f7f5!important}
    [data-noir-storefront] [data-theme-secondary-mobile-menu]{
      border-color:rgba(255,255,255,.12)!important;background:#161616!important
    }
    [data-noir-storefront] [data-theme-secondary-mobile-menu] a{
      background:#242424!important;color:#f7f7f5!important
    }
    [data-noir-storefront] [data-theme-secondary-mobile-menu] a[aria-current="page"]{
      background:var(--storefront-primary,#f5aaa5)!important;color:#111!important
    }
    [data-noir-storefront] [data-storefront-page]{min-height:62vh;background:#f7f7f5}
    [data-noir-storefront] [data-storefront-page] > section:first-child{
      border-bottom:1px solid #dedbd8;background:#fff
    }
    [data-noir-storefront] [data-storefront-page] h1,
    [data-noir-storefront] [data-storefront-page] h2{
      font-family:var(--storefront-heading,Inter),sans-serif;letter-spacing:0
    }
    [data-noir-storefront] [data-storefront-chrome="footer"]{
      border-color:rgba(255,255,255,.12)!important;background:#101010!important;color:#f7f7f5
    }
    [data-noir-storefront] [data-storefront-chrome="footer"] h2,
    [data-noir-storefront] [data-storefront-chrome="footer"] div,
    [data-noir-storefront] [data-storefront-chrome="footer"] a{color:inherit!important}
    [data-noir-storefront] [data-storefront-chrome="footer"] p{color:#aaa5a1!important}
    [data-noir-product-card]{
      border:1px solid rgba(255,255,255,.12);background:#111;color:#fff;
      box-shadow:0 12px 28px rgba(0,0,0,.1);
      transition:transform 180ms ease,box-shadow 180ms ease
    }
    [data-noir-product-card]:hover{transform:translateY(-3px);box-shadow:0 20px 40px rgba(0,0,0,.18)}
    @media(max-width:639px){
      [data-noir-storefront] [data-storefront-page] > section > div{padding-left:16px;padding-right:16px}
      [data-noir-product-card]:hover{transform:none}
    }
    @media(prefers-reduced-motion:reduce){[data-noir-product-card]{transition:none}}
  `}</style>
));

NoirChronoStorefrontStyles.displayName = "NoirChronoStorefrontStyles";
