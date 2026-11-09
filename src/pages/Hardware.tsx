import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const items = [
  { name: "Reader", price: "Free", desc: "Tap, dip, and swipe. Connects to your phone via Bluetooth.", tone: "bg-brand-sand" },
  { name: "Stand", price: "$149", desc: "A swivel iPad stand that turns checkout into delight.", tone: "bg-brand-cream" },
  { name: "Terminal", price: "$299", desc: "All-in-one POS with built-in printer and screen.", tone: "bg-foreground text-background" },
  { name: "Register", price: "$799", desc: "A full counter system with a customer-facing display.", tone: "bg-gradient-coral text-background" },
];

const Hardware = () => (
  <MarketingLayout>
    <section className="bg-gradient-hero">
      <div className="container py-20 lg:py-28 text-center">
        <span className="text-xs uppercase tracking-widest font-semibold opacity-70">Storeblink Hardware</span>
        <h1 className="text-display mt-3 mb-6 max-w-3xl mx-auto">Hardware that disappears into your counter.</h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">Designed in-house. Built to last. Made to look beautiful in any space.</p>
        <Button asChild size="lg"><Link to="/auth?mode=signup">Shop hardware</Link></Button>
      </div>
    </section>

    <section className="container py-24 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {items.map((it) => (
        <div key={it.name} className={`${it.tone} rounded-3xl p-8 aspect-[3/4] flex flex-col justify-between transition-smooth hover:shadow-elev`}>
          <div className="aspect-square rounded-2xl bg-current/5 grid place-items-center mb-6 relative overflow-hidden">
            {/* CSS device illustration */}
            <div className="w-24 h-32 rounded-xl bg-background/90 shadow-elev relative">
              <div className="absolute inset-x-3 top-3 h-1 rounded bg-foreground/20" />
              <div className="absolute inset-x-3 bottom-3 h-8 rounded bg-foreground/10" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-semibold">{it.name}</h3>
            <p className="text-sm opacity-70 mt-1 mb-3">{it.desc}</p>
            <div className="font-semibold">{it.price}</div>
          </div>
        </div>
      ))}
    </section>
  </MarketingLayout>
);

export default Hardware;
