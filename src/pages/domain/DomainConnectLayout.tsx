import { Activity, FileSearch, Globe2, Search, ShieldCheck, ShoppingBag, Waypoints } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Logo } from "@/components/marketing/Logo";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const navigation = [
  { to: "/domain/connect", label: "Domains", icon: Globe2, end: true },
  { to: "/domain/connect/existing", label: "Connect", icon: Waypoints },
  { to: "/domain/connect/search", label: "Find a domain", icon: Search },
  { to: "/domain/connect/transfer", label: "Transfer", icon: ShoppingBag },
  { to: "/domain/connect/google", label: "Google Search", icon: ShieldCheck },
  { to: "/domain/connect/seo", label: "SEO & Sitemap", icon: FileSearch },
  { to: "/domain/connect/status", label: "Provisioning", icon: Activity },
];

const DomainConnectLayout = () => {
  const { currentStore } = useAuth();
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Logo to="/dashboard" ariaLabel="Storeblink dashboard" />
            <div className="hidden h-6 w-px bg-border sm:block" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Domains & SEO</p>
              <p className="truncate text-xs text-muted-foreground">{currentStore?.name}</p>
            </div>
          </div>
          <Link to="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Back to dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-b bg-background md:min-h-[calc(100vh-4rem)] md:border-b-0 md:border-r">
          <nav className="flex overflow-x-auto p-2 md:block md:space-y-1 md:p-4" aria-label="Domain settings">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cn(
                  "flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 px-4 py-8 sm:px-6 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DomainConnectLayout;
