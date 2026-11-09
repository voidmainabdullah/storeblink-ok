import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, CreditCard, Package, Users, LogOut, Store, ShoppingBag, Globe2, Code2 } from "lucide-react";
import { Logo } from "@/components/marketing/Logo";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/dashboard/store", label: "My Store", icon: Store },
  { to: "/dashboard/theme-studio", label: "Theme Studio", icon: Code2, capability: "theme.studio" as const },
  { to: "/dashboard/items", label: "Items", icon: Package },
  { to: "/dashboard/orders", label: "Orders", icon: ShoppingBag },
  { to: "/dashboard/payments", label: "Payments", icon: CreditCard },
  { to: "/dashboard/customers", label: "Customers", icon: Users },
  { to: "/domain/connect", label: "Domains", icon: Globe2 },
];

const DashboardLayout = () => {
  const { user, signOut, hasCapability } = useAuth();
  const navigate = useNavigate();
  const handleSignOut = async () => { await signOut(); navigate("/"); };
  const availableNavItems = navItems.filter((item) =>
    !("capability" in item) || hasCapability(item.capability));

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex w-60 flex-col bg-foreground text-background p-5">
        <div className="mb-8"><Logo inverted /></div>
        <nav className="flex-1 space-y-1">
          {availableNavItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-smooth ${
                  isActive ? "bg-background/10 text-background" : "text-background/60 hover:text-background hover:bg-background/5"
                }`
              }
            >
              <it.icon size={18} />
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-background/10 pt-4 space-y-2">
          <div className="px-3 text-xs text-background/50 truncate">{user?.email}</div>
          <Button onClick={handleSignOut} variant="ghost" className="w-full justify-start text-background/70 hover:text-background hover:bg-background/10">
            <LogOut size={16} className="mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-foreground text-background border-t border-background/10">
        <div className="flex overflow-x-auto py-2">
          {availableNavItems.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end}
              className={({ isActive }) => `flex min-w-[72px] flex-col items-center gap-1 px-3 py-1 text-xs ${isActive ? "text-background" : "text-background/60"}`}>
              <it.icon size={18} />
              {it.label}
            </NavLink>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        <header className="md:hidden flex justify-between items-center p-4 border-b border-border">
          <Logo />
          <Button variant="ghost" size="sm" onClick={handleSignOut}><LogOut size={16} /></Button>
        </header>
        <div className="p-6 lg:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
