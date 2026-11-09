import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Check, Sparkles, Store, Shirt, UtensilsCrossed, Sparkle, Laptop, Wrench, Cloud, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME_PRESETS, resolveTheme } from "@/lib/storeTheme";
import { buildBasicTemplateScene } from "@/editor/engine/engineTemplates";
import { createEngineSceneTheme } from "@/editor/engine/storeSceneAdapter";
import type { Json } from "@/integrations/supabase/types";
import { BrandLogo } from "@/components/marketing/Logo";

const BUSINESS_TYPES = [
  { id: "retail", label: "Retail & Marketplace", icon: Store, hint: "Physical goods, everyday shop" },
  { id: "fashion", label: "Fashion & Apparel", icon: Shirt, hint: "Clothing, accessories, jewelry" },
  { id: "food", label: "Food & Beverage", icon: UtensilsCrossed, hint: "Restaurants, cafes, bakeries" },
  { id: "beauty", label: "Beauty & Personal Care", icon: Sparkle, hint: "Skincare, cosmetics, wellness" },
  { id: "electronics", label: "Electronics & Tech", icon: Laptop, hint: "Gadgets, accessories" },
  { id: "services", label: "Services", icon: Wrench, hint: "Bookings, appointments" },
  { id: "digital", label: "Digital Goods", icon: Cloud, hint: "Downloads, courses, memberships" },
  { id: "other", label: "Something else", icon: Package, hint: "Custom or mixed" },
];

const CATEGORY_SUGGESTIONS: Record<string, string[]> = {
  retail: ["Home", "Kitchen", "Toys", "Books", "Sports", "Pets", "Garden", "Office"],
  fashion: ["Women", "Men", "Kids", "Shoes", "Bags", "Jewelry", "Accessories", "Watches"],
  food: ["Breakfast", "Mains", "Drinks", "Desserts", "Sides", "Combos", "Seasonal", "Vegan"],
  beauty: ["Skincare", "Makeup", "Hair", "Fragrance", "Body", "Tools", "Nails", "Wellness"],
  electronics: ["Phones", "Laptops", "Audio", "Wearables", "Gaming", "Accessories", "Smart Home", "Cameras"],
  services: ["Consultation", "Grooming", "Fitness", "Tutoring", "Repair", "Cleaning", "Design", "Events"],
  digital: ["Templates", "Courses", "eBooks", "Presets", "Music", "Fonts", "Memberships", "Plugins"],
  other: ["Featured", "New", "Best sellers", "Sale", "Trending", "Bundles", "Gifts", "Custom"],
};

const Onboarding = () => {
  const { user, bootstrap, loading, completeOnboarding } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [saving, setSaving] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const completionAttempt = useRef(false);
  const redirectTimer = useRef<number | null>(null);

  const [businessType, setBusinessType] = useState<string>("");
  const [businessName, setBusinessName] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [customCat, setCustomCat] = useState("");
  const [preset, setPreset] = useState<string>("");

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/auth"); return; }
    if (bootstrap?.profile.onboardingCompleted && !completionAttempt.current) {
      navigate("/dashboard", { replace: true });
    }
    if (bootstrap?.profile.businessName) setBusinessName(bootstrap.profile.businessName);
  }, [bootstrap, user, loading, navigate]);

  useEffect(() => () => {
    if (redirectTimer.current !== null) window.clearTimeout(redirectTimer.current);
  }, []);

  const suggestions = useMemo(
    () => CATEGORY_SUGGESTIONS[businessType] ?? CATEGORY_SUGGESTIONS.other,
    [businessType],
  );

  const canNext = () => {
    if (step === 0) return !!businessType;
    if (step === 1) return businessName.trim().length >= 2;
    if (step === 2) return categories.length >= 1 && !!preset;
    return true;
  };

  const go = (delta: number) => {
    setDir(delta > 0 ? "fwd" : "back");
    setStep((s) => Math.max(0, Math.min(2, s + delta)));
  };

  const addCategory = (c: string) => {
    const v = c.trim();
    if (!v) return;
    if (categories.includes(v)) return;
    setCategories([...categories, v].slice(0, 12));
    setCustomCat("");
  };

  const finish = async () => {
    if (!user) return;
    completionAttempt.current = true;
    setSaving(true);
    try {
      const chosen = THEME_PRESETS.find((p) => p.id === preset) ?? THEME_PRESETS[0];
      const current = resolveTheme(undefined, undefined);
      const nextTheme = {
        ...current,
        ...chosen.theme,
        text_overrides: { ...current.text_overrides, ...(chosen.theme.text_overrides ?? {}) },
      };
      const engineTheme = createEngineSceneTheme(
        buildBasicTemplateScene({
          business_name: businessName.trim(),
          store_color: nextTheme.accent,
        }, []),
      );
      await completeOnboarding({
        businessName: businessName.trim(),
        requestedHandle: businessName,
        storeTemplate: chosen.template ?? "minimal",
        storeColor: nextTheme.accent,
        theme: engineTheme as unknown as Json,
        businessType,
        categories,
      });
      toast.success("Your store is ready");
      setShowSplash(true);
      redirectTimer.current = window.setTimeout(
        () => navigate("/dashboard", { replace: true }),
        2600,
      );
    } catch (e: any) {
      completionAttempt.current = false;
      toast.error(e.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#faf8f3] text-neutral-900">
      {/* soft light gradient */}
      <div className="absolute inset-0 -z-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 45% at 20% 10%, hsl(28 90% 88% / 0.9), transparent 60%)," +
            "radial-gradient(50% 40% at 90% 20%, hsl(200 80% 90% / 0.7), transparent 60%)," +
            "radial-gradient(55% 45% at 60% 100%, hsl(340 80% 92% / 0.8), transparent 60%)",
        }} />

      {/* Inline splash overlay — plays over onboarding then redirects */}
      {showSplash && (
        <div className="fixed inset-0 z-50 bg-[#faf8f3] flex items-center justify-center animate-in fade-in duration-300">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full blur-3xl opacity-60"
              style={{ background: "radial-gradient(circle, #ffe7d6 0%, transparent 70%)" }} />
            <div className="absolute -bottom-40 -right-40 w-[560px] h-[560px] rounded-full blur-3xl opacity-60"
              style={{ background: "radial-gradient(circle, #e8ecff 0%, transparent 70%)" }} />
          </div>
          <div className="relative w-[min(82vw,28rem)] ob-splash-rise">
            <BrandLogo className="w-full ob-splash-pop" />
            <div className="ob-splash-underline mt-3 h-[2px] bg-neutral-900/80 origin-left" />
          </div>
          <style>{`
            @keyframes obRise { 0% { opacity:0; transform:translateY(14px);} 100% { opacity:1; transform:translateY(0);} }
            @keyframes obPop { 0% { opacity:0; transform:scale(.6) rotate(-8deg); filter:blur(4px);} 60% { opacity:1; transform:scale(1.06); filter:blur(0);} 100% { transform:scale(1);} }
            @keyframes obUnder { 0% { transform:scaleX(0);} 100% { transform:scaleX(1);} }
            .ob-splash-rise { animation: obRise 700ms cubic-bezier(0.2,0.8,0.2,1) both; }
            .ob-splash-pop { animation: obPop 900ms cubic-bezier(0.2,0.8,0.2,1) both; }
            .ob-splash-underline { animation: obUnder 700ms 700ms cubic-bezier(0.2,0.8,0.2,1) both; }
          `}</style>
        </div>
      )}


      <div className="relative z-10 mx-auto max-w-3xl px-6 pt-10 pb-16">
        {/* progress */}
        <div className="flex items-center gap-2 mb-10">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex-1 h-1.5 rounded-full bg-neutral-200/70 overflow-hidden">
              <div className={cn("h-full bg-neutral-900 transition-all duration-500",
                i < step ? "w-full" : i === step ? "w-1/2" : "w-0")} />
            </div>
          ))}
        </div>

        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Step {step + 1} of 3</div>

        {/* animated slide container */}
        <div key={step} className={cn(
          "will-change-transform",
          dir === "fwd" ? "animate-in slide-in-from-right-8 fade-in duration-500" : "animate-in slide-in-from-left-8 fade-in duration-500",
        )}>
          {step === 0 && (
            <>
              <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mb-3">What's your business?</h1>
              <p className="text-neutral-600 mb-8">Pick the one that fits best — we'll tailor everything from templates to categories.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {BUSINESS_TYPES.map((b) => {
                  const Icon = b.icon;
                  const active = businessType === b.id;
                  return (
                    <button key={b.id} onClick={() => setBusinessType(b.id)}
                      className={cn(
                        "text-left rounded-2xl border p-4 transition-all group bg-white/70 backdrop-blur",
                        active ? "border-neutral-900 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.35)] scale-[1.01]" : "border-neutral-200/80 hover:border-neutral-400 hover:bg-white",
                      )}>
                      <div className="flex items-start gap-3">
                        <div className={cn("w-10 h-10 rounded-xl grid place-items-center transition-colors",
                          active ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 group-hover:bg-neutral-200")}>
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{b.label}</div>
                          <div className="text-xs text-neutral-500 mt-0.5">{b.hint}</div>
                        </div>
                        {active && <Check size={16} className="text-neutral-900" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mb-3">Name your store</h1>
              <p className="text-neutral-600 mb-8">
                This becomes your store link. You can change the name up to <span className="font-medium text-neutral-900">3 times</span> — after that it's permanent.
              </p>
              <div className="rounded-2xl border border-neutral-200 bg-white/80 backdrop-blur p-5 shadow-sm">
                <label className="text-xs uppercase tracking-widest text-neutral-500">Store name</label>
                <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Nova Threads" maxLength={60}
                  className="text-2xl md:text-3xl font-semibold border-0 focus-visible:ring-0 px-0 mt-1 bg-transparent h-auto py-2" />
                <div className="mt-4 flex items-center gap-2 text-sm text-neutral-500">
                  <div className="px-2 py-1 rounded-md bg-neutral-100 border border-neutral-200 font-mono text-xs">
                    yourshop.app/store/<span className="text-neutral-900">{businessName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "your-name"}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mb-3">Categories & style</h1>
              <p className="text-neutral-600 mb-8">Pick a few categories you'll sell in, then choose a starting style. You can change everything later.</p>

              <div className="rounded-2xl border border-neutral-200 bg-white/80 backdrop-blur p-5 mb-6">
                <div className="text-xs uppercase tracking-widest text-neutral-500 mb-3">Categories</div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {suggestions.map((c) => {
                    const active = categories.includes(c);
                    return (
                      <button key={c} onClick={() => active ? setCategories(categories.filter(x => x !== c)) : addCategory(c)}
                        className={cn("px-3 py-1.5 rounded-full text-sm border transition-colors",
                          active ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400")}>
                        {active && <Check size={12} className="inline mr-1 -mt-0.5" />}{c}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Input value={customCat} onChange={(e) => setCustomCat(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(customCat); } }}
                    placeholder="Add your own category and press Enter"
                    className="bg-white" />
                  <Button variant="secondary" onClick={() => addCategory(customCat)} disabled={!customCat.trim()}>Add</Button>
                </div>
                {categories.length > 0 && (
                  <div className="mt-3 text-xs text-neutral-500">{categories.length} selected</div>
                )}
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white/80 backdrop-blur p-5">
                <div className="text-xs uppercase tracking-widest text-neutral-500 mb-3">Store style</div>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {THEME_PRESETS.map((p) => {
                    const active = preset === p.id;
                    return (
                      <button key={p.id} onClick={() => setPreset(p.id)}
                        className={cn("text-left rounded-xl overflow-hidden border transition-all",
                          active ? "border-neutral-900 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.35)] scale-[1.01]" : "border-neutral-200 hover:border-neutral-400")}>
                        <div className="aspect-[16/10] relative"
                          style={{ background: `linear-gradient(135deg, ${p.theme.bg ?? "#1a1a1a"}, ${p.theme.accent ?? "#5669ff"})` }}>
                          <div className="absolute bottom-2 left-3 text-white font-semibold drop-shadow">{p.name}</div>
                          {active && <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white grid place-items-center"><Check size={12} /></div>}
                        </div>
                        <div className="p-2.5 text-xs text-neutral-500 bg-white">{p.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* nav */}
        <div className="flex items-center justify-between mt-10">
          <Button variant="ghost" onClick={() => go(-1)} disabled={step === 0}
            className="text-neutral-600 hover:text-neutral-900">
            <ArrowLeft size={16} className="mr-1.5" /> Back
          </Button>
          {step < 2 ? (
            <Button onClick={() => go(1)} disabled={!canNext()} size="lg"
              className="bg-neutral-900 hover:bg-neutral-800 rounded-full px-6">
              Continue <ArrowRight size={16} className="ml-1.5" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={!canNext() || saving} size="lg"
              className="bg-neutral-900 hover:bg-neutral-800 rounded-full px-6">
              {saving ? "Creating…" : <>Create store <Sparkles size={16} className="ml-1.5" /></>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
