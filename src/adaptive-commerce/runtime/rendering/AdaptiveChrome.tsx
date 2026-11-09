import { Link, NavLink } from "react-router-dom";
import type { AdaptiveStorefrontNavigationItem } from "./types";

export const AdaptiveHeader = ({
  storeName,
  homeHref,
  cartHref,
  cartCount,
  navigation,
}: Readonly<{
  storeName: string;
  homeHref: string;
  cartHref: string;
  cartCount: number;
  navigation: readonly AdaptiveStorefrontNavigationItem[];
}>) => (
  <header className="sb-adaptive-header">
    <div className="sb-adaptive-container sb-adaptive-header__inner">
      <Link className="sb-adaptive-brand" to={homeHref}>{storeName}</Link>
      <nav aria-label="Primary navigation" className="sb-adaptive-navigation">
        {navigation.map((item) => (
          <NavLink key={item.id} to={item.href}>{item.label}</NavLink>
        ))}
      </nav>
      <Link className="sb-adaptive-cart-link" to={cartHref} aria-label={`Cart with ${cartCount} items`}>
        Cart <span aria-hidden="true">({cartCount})</span>
      </Link>
    </div>
  </header>
);

export const AdaptiveFooter = ({
  storeName,
  homeHref,
  navigation,
}: Readonly<{
  storeName: string;
  homeHref: string;
  navigation: readonly AdaptiveStorefrontNavigationItem[];
}>) => (
  <footer className="sb-adaptive-footer">
    <div className="sb-adaptive-container sb-adaptive-footer__inner">
      <div>
        <Link className="sb-adaptive-brand" to={homeHref}>{storeName}</Link>
        <p>A thoughtful, dependable shopping experience.</p>
      </div>
      <nav aria-label="Footer navigation">
        {navigation.map((item) => <Link key={item.id} to={item.href}>{item.label}</Link>)}
      </nav>
      <p className="sb-adaptive-legal">© {new Date().getFullYear()} {storeName}</p>
    </div>
  </footer>
);
