import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";

const tiers = [
  { name: "Free", price: "$0", desc: "For sellers just starting out.", features: ["Free POS app","Free online store","Free card reader","2.6% + 10¢ per tap"], cta: "Get started", tone: "bg-card border" },
  { name: "Plus", price: "$29", per: "/mo", desc: "More tools to grow.", features: ["Advanced reporting","Team management","Customer directory","Lower processing rates"], cta: "Start free trial", tone: "bg-foreground text-background", featured: true },
  { name: "Premium", price: "Custom", desc: "For high-volume sellers.", features: ["Custom rates","Dedicated support","API access","SLA guarantees"], cta: "Talk to sales", tone: "bg-card border" },
];

const Pricing = () => (
  <MarketingLayout>
    <section className="container py-20 lg:py-28 text-center">
      <h1 className="text-display mb-4">Simple pricing. Big results.</h1>
      <p className="text-lg text-muted-foreground max-w-xl mx-auto">No monthly fees on Free. No hidden charges. Just pay for what you sell.</p>
    </section>

    <section className="container pb-24">
      <div className="grid md:grid-cols-3 gap-6">
        {tiers.map((t) => (
          <div key={t.name} className={`${t.tone} rounded-3xl p-8 ${t.featured ? "lg:scale-105 shadow-elev" : ""}`}>
            {t.featured && <div className="text-xs uppercase tracking-widest font-semibold mb-3 opacity-70">Most popular</div>}
            <h3 className="text-2xl font-semibold mb-2">{t.name}</h3>
            <p className="opacity-70 mb-6 text-sm">{t.desc}</p>
            <div className="mb-6">
              <span className="text-5xl font-semibold tracking-tight">{t.price}</span>
              {t.per && <span className="opacity-70">{t.per}</span>}
            </div>
            <Button asChild className={`w-full mb-6 ${t.featured ? "bg-background text-foreground hover:bg-background/90" : ""}`}>
              <Link to="/auth?mode=signup">{t.cta}</Link>
            </Button>
            <ul className="space-y-3">
              {t.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm"><Check size={16} className="text-brand-mint shrink-0" /> {f}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  </MarketingLayout>
);

export default Pricing;
