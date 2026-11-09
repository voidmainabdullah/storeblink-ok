import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowUp, Sparkles, Home, Search, FolderOpen, Star,
  User as UserIcon, Gift, Zap, ExternalLink, Package, TrendingUp, Clock,
  ShoppingBag, Settings2, Plus,
} from "lucide-react";
import { ProfilePopover } from "@/components/dashboard/ProfilePopover";
import { NotificationsPopover } from "@/components/dashboard/NotificationsPopover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { StoreSceneItem } from "@/editor/engine/storeSceneAdapter";
import {
  planAdaptiveStorefront,
  type AdaptivePlannerProposal,
} from "@/adaptive-commerce/ai";
import {
  createEditorStoreDataService,
  type EditorStoreProfile,
} from "@/platform/editor-data";

const SidebarItem = ({ icon: Icon, label, active = false, suffix, onClick, to }: any) => {
  const cls = cn(
    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left",
    active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
  );
  const inner = (
    <>
      <Icon size={16} className="opacity-80" />
      <span className="flex-1 truncate">{label}</span>
      {suffix && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200/80 text-neutral-600">{suffix}</span>}
    </>
  );
  return to ? <Link to={to} className={cls}>{inner}</Link> : <button onClick={onClick} className={cls}>{inner}</button>;
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="px-3 pt-5 pb-1 text-[11px] uppercase tracking-wider text-neutral-400 font-medium">{children}</div>
);

const Overview = () => {
  const { user, bootstrap, currentStore, hasCapability } = useAuth();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [profile, setProfile] = useState<EditorStoreProfile | null>(null);
  const [items, setItems] = useState<StoreSceneItem[]>([]);
  const [productView, setProductView] = useState<"new" | "best">("new");
  const [proposal, setProposal] = useState<AdaptivePlannerProposal | null>(null);
  const editorData = useMemo(() => createEditorStoreDataService(), []);

  const loadAll = useCallback(async () => {
    if (!user || !currentStore) return;
    const loaded = await editorData.load(user, currentStore.id);
    setProfile(loaded.profile);
    setItems([...loaded.items]);
  }, [currentStore, editorData, user]);
  useEffect(() => { void loadAll(); }, [loadAll]);

  const firstName = (
    bootstrap?.profile.fullName || user?.email?.split("@")[0] || "there"
  ).split(" ")[0];

  const displayedProducts = useMemo(() => {
    const list = [...items];
    if (productView === "best") {
      list.sort((a, b) => Number(b.sold_count ?? 0) - Number(a.sold_count ?? 0));
    } else {
      list.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
    }
    return list.slice(0, 8);
  }, [items, productView]);

  const stats = useMemo(() => ({
    products: items.length,
    published: items.filter((i) => i.is_published).length,
    categories: profile?.categories.length ?? 0,
  }), [items, profile]);

  const generateFromPrompt = async () => {
    if (!prompt.trim() || !user || !currentStore || !hasCapability("theme.edit")) return;
    setGenerating(true);
    try {
      const nextProposal = await planAdaptiveStorefront({
        storeId: currentStore.id,
        intent: prompt,
      });
      setProposal(nextProposal);
      toast.success("Certified proposal ready for review. No storefront changes were made.");
      setPrompt("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The proposal could not be created.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#faf8f3] text-neutral-900">
      {/* Ambient light gradient */}
      <div className="fixed inset-0 -z-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(50% 40% at 15% 0%, hsl(28 90% 92% / 0.9), transparent 60%)," +
            "radial-gradient(45% 40% at 85% 10%, hsl(200 80% 94% / 0.8), transparent 60%)," +
            "radial-gradient(55% 40% at 60% 100%, hsl(340 80% 95% / 0.7), transparent 60%)",
        }} />

      {/* Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col bg-white/70 backdrop-blur border-r border-neutral-200/70 p-3 relative z-10">
        <div className="flex items-center gap-2 px-2 py-2 mb-2">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-pink-500 via-rose-500 to-orange-500 shadow-sm" />
          <div className="font-semibold tracking-tight">Storeblink</div>
        </div>
        <button className="w-full flex items-center justify-between gap-2 px-3 py-2 mb-3 rounded-lg bg-white border border-neutral-200 text-sm hover:border-neutral-300 transition-colors shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-orange-500 to-rose-500 grid place-items-center text-[10px] font-bold text-white shrink-0">
              {(firstName[0] || "S").toUpperCase()}
            </div>
            <span className="truncate">{firstName}'s workspace</span>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>

        <SidebarItem icon={Home} label="Home" active />
        <SidebarItem icon={Search} label="Search" suffix="⌘K" />
        <SidebarItem icon={ShoppingBag} label="Orders" to="/dashboard/orders" />
        <SidebarItem icon={UserIcon} label="Customers" to="/dashboard/customers" />

        <SectionLabel>Store</SectionLabel>
        <SidebarItem icon={Settings2} label="Visual editor" to="/dashboard/store" />
        <SidebarItem icon={Package} label="Products" to="/dashboard/items" />
        <SidebarItem icon={FolderOpen} label="Payments" to="/dashboard/payments" />

        <SectionLabel>Recents</SectionLabel>
        {items.slice(0, 4).map((it) => (
          <button key={it.id} onClick={() => navigate("/dashboard/items")}
            className="w-full text-left px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-900 truncate rounded-md hover:bg-neutral-100">
            {it.name}
          </button>
        ))}

        <div className="mt-auto space-y-2 pt-4">
          <button className="w-full rounded-xl bg-white border border-neutral-200 p-3 flex items-center gap-3 hover:border-neutral-300 transition-colors shadow-sm">
            <Zap size={16} className="text-amber-500" />
            <div className="text-left">
              <div className="text-sm font-semibold">Upgrade to Pro</div>
              <div className="text-xs text-neutral-500">Unlock more features</div>
            </div>
          </button>
          <div className="flex items-center justify-between px-1">
            <ProfilePopover />
            <NotificationsPopover />
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 relative overflow-x-hidden overflow-y-auto z-10">
        {/* mobile header */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-neutral-200 bg-white/70 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-pink-500 to-orange-500" />
            <div className="font-semibold">Storeblink</div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationsPopover />
            <ProfilePopover />
          </div>
        </div>

        <div className="px-6 md:px-10 pt-12 pb-8 flex flex-col items-center">
          <button className="mb-6 px-4 py-1.5 rounded-full bg-white/80 backdrop-blur border border-neutral-200 text-sm flex items-center gap-2 hover:bg-white transition-colors shadow-sm">
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-neutral-900 text-white rounded">New</span>
            Onboarding & presets are live →
          </button>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-center mb-2">
            Welcome back, {firstName}
          </h1>
          <p className="text-neutral-500 mb-8 text-center max-w-lg">
            {profile?.business_name ? <>Editing <span className="font-medium text-neutral-800">{profile.business_name}</span> · describe the direction and review a certified proposal.</> : "Describe your store and review a certified design proposal."}
          </p>

          {/* Prompt input */}
          <div className="w-full max-w-2xl rounded-2xl bg-white border border-neutral-200">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generateFromPrompt(); }}
              placeholder="Create a proposal — for example, ‘A calm editorial shop for handmade ceramics’"
              rows={2}
              className="w-full bg-transparent px-5 pt-4 pb-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none resize-none" />
            <div className="flex items-center justify-end gap-2 px-3 pb-3">
                <button onClick={() => navigate("/dashboard/store")}
                  className="px-3 py-1.5 text-xs rounded-md bg-neutral-100 hover:bg-neutral-200 flex items-center gap-1.5 text-neutral-700 transition-colors">
                  <Sparkles size={12} /> Visual editor
                </button>
                <button
                  onClick={generateFromPrompt}
                  disabled={generating || !prompt.trim() || !hasCapability("theme.edit")}
                  aria-label="Create certified proposal"
                  className="w-8 h-8 rounded-md grid place-items-center bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {generating ? (
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="50" strokeLinecap="round" />
                    </svg>
                  ) : <ArrowUp size={14} />}
                </button>
            </div>
          </div>
          {proposal && (
            <section
              aria-label="Adaptive design proposal"
              className="mt-4 w-full max-w-2xl rounded-2xl border border-neutral-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Ready for review</p>
                  <h2 className="mt-1 text-base font-semibold text-neutral-900">
                    {proposal.plan.storeKit.id} <span className="font-normal text-neutral-500">v{proposal.plan.storeKit.version}</span>
                  </h2>
                </div>
                <span className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600">
                  {proposal.audit.attempts} {proposal.audit.attempts === 1 ? "attempt" : "attempts"}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-neutral-500">Design preset</dt>
                  <dd className="mt-0.5 font-medium text-neutral-800">{proposal.plan.presetId ?? "StoreKit default"}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Certified variants</dt>
                  <dd className="mt-0.5 font-medium text-neutral-800">{proposal.plan.variantSelections.length}</dd>
                </div>
              </dl>
              <p className="mt-4 border-t border-neutral-100 pt-3 text-xs leading-5 text-neutral-500">
                No storefront changes were made. Open the visual editor to review and apply supported choices through the normal save flow.
              </p>
            </section>
          )}
        </div>

        {/* Store card + stats */}
        <div className="px-4 md:px-10 grid gap-4 md:grid-cols-3 mb-6">
          <Link to="/dashboard/store" className="md:col-span-2 group rounded-2xl overflow-hidden border border-neutral-200 bg-white shadow-sm hover:shadow-md transition-shadow">
            <div className="aspect-[24/9] relative"
              style={{
                background: profile?.store_banner_url
                  ? `url(${profile.store_banner_url}) center/cover`
                  : `linear-gradient(135deg, ${profile?.store_color ?? "#5669ff"}, #1a1a2e)`,
              }}>
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
              <div className="absolute bottom-4 left-5 right-5 text-white">
                <div className="text-2xl font-semibold drop-shadow">{profile?.business_name || "Your store"}</div>
                {profile?.store_tagline && <div className="text-white/80 text-sm mt-1 line-clamp-1">{profile.store_tagline}</div>}
              </div>
              {profile?.store_slug && (
                <a
                  href={currentStore?.status === "published"
                    ? `/store/${profile.store_slug}`
                    : "/dashboard/store/preview"}
                  target="_blank" rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur text-xs font-medium text-neutral-900 hover:bg-white transition-colors">
                  {currentStore?.status === "published" ? "View live" : "Preview draft"} <ExternalLink size={11} />
                </a>
              )}
            </div>
            <div className="p-4 flex items-center gap-3">
              <div className="flex-1">
                <div className="text-xs text-neutral-500">Store link</div>
                <div className="text-sm font-mono text-neutral-800 truncate">/store/{profile?.store_slug || "…"}</div>
              </div>
              <div className="text-sm text-neutral-500 group-hover:text-neutral-900 transition-colors">Edit →</div>
            </div>
          </Link>

          <div className="grid grid-cols-3 md:grid-cols-1 gap-4">
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-neutral-500 text-xs"><Package size={13} /> Products</div>
              <div className="text-2xl font-semibold mt-1">{stats.products}</div>
              <div className="text-xs text-neutral-500 mt-0.5">{stats.published} published</div>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-neutral-500 text-xs"><FolderOpen size={13} /> Categories</div>
              <div className="text-2xl font-semibold mt-1">{stats.categories}</div>
              <div className="text-xs text-neutral-500 mt-0.5">from onboarding</div>
            </div>
            <Link to="/dashboard/items" className="rounded-2xl border border-dashed border-neutral-300 bg-white/50 p-4 grid place-items-center text-neutral-500 hover:bg-white hover:text-neutral-900 transition-colors">
              <div className="text-center">
                <Plus size={18} className="mx-auto" />
                <div className="text-xs mt-1">Add product</div>
              </div>
            </Link>
          </div>
        </div>

        {/* Products panel */}
        <div className="mx-4 md:mx-10 mb-10 rounded-2xl bg-white border border-neutral-200 p-4 md:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-neutral-500">Products</div>
              <div className="text-lg font-semibold">Store catalog</div>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-neutral-100 p-1">
              <button onClick={() => setProductView("new")}
                className={cn("px-3 py-1.5 text-sm rounded-full transition-colors flex items-center gap-1.5",
                  productView === "new" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800")}>
                <Clock size={13} /> New
              </button>
              <button onClick={() => setProductView("best")}
                className={cn("px-3 py-1.5 text-sm rounded-full transition-colors flex items-center gap-1.5",
                  productView === "best" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800")}>
                <TrendingUp size={13} /> Best selling
              </button>
              <Link to="/dashboard/items" className="ml-1 px-3 py-1.5 text-sm rounded-full text-neutral-500 hover:text-neutral-900">
                All →
              </Link>
            </div>
          </div>

          {displayedProducts.length === 0 ? (
            <div className="border border-dashed border-neutral-200 rounded-xl py-16 text-center">
              <Package className="mx-auto mb-2 text-neutral-400" size={28} />
              <div className="text-neutral-700 font-medium">No products yet</div>
              <div className="text-sm text-neutral-500 mb-4">Add your first product to see it here.</div>
              <Link to="/dashboard/items" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-neutral-900 text-white text-sm hover:bg-neutral-800">
                <Plus size={14} /> Add product
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {displayedProducts.map((it) => (
                <Link key={it.id} to="/dashboard/items"
                  className="group rounded-xl overflow-hidden border border-neutral-200 bg-white hover:shadow-md hover:border-neutral-300 transition-all">
                  <div className="aspect-square bg-neutral-100 relative">
                    {it.image_url ? (
                      <img src={it.image_url} alt={it.name} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-neutral-100 to-neutral-200" />
                    )}
                    {productView === "best" && (it.sold_count ?? 0) > 0 && (
                      <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white">
                        {it.sold_count} sold
                      </span>
                    )}
                    {!it.is_published && (
                      <span className="absolute top-2 right-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-neutral-900/80 text-white">Draft</span>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-medium text-neutral-900 truncate">{it.name}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">${(Number(it.price_cents ?? 0) / 100).toFixed(2)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Overview;
