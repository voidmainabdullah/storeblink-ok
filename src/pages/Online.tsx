import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import onlineImg from "@/assets/online-seller.jpg";
import { Globe, ShoppingBag, Truck, Megaphone } from "lucide-react";

const Online = () => (
  <MarketingLayout>
    <section className="bg-brand-cream">
      <div className="container py-20 lg:py-28 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <span className="text-xs uppercase tracking-widest font-semibold opacity-70">Storeblink Online</span>
          <h1 className="text-display mt-3 mb-6">A free online store, ready when you are.</h1>
          <p className="text-lg text-muted-foreground mb-8">Build a beautiful website, sell with checkout, and offer pickup, delivery, or shipping — without writing code.</p>
          <Button asChild size="lg"><Link to="/auth?mode=signup">Start your store</Link></Button>
        </div>
        <img src={onlineImg} alt="Boutique owner managing online store" loading="lazy" className="rounded-2xl shadow-elev" />
      </div>
    </section>

    <section className="container py-24 grid md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[
        { i: <Globe size={22} />, t: "Free site", d: "Drag-and-drop pages with a custom domain." },
        { i: <ShoppingBag size={22} />, t: "Synced inventory", d: "One catalog across in-person and online." },
        { i: <Truck size={22} />, t: "Shipping & pickup", d: "Local delivery, USPS, FedEx, UPS." },
        { i: <Megaphone size={22} />, t: "Marketing", d: "Email and social campaigns, built in." },
      ].map((f) => (
        <div key={f.t} className="bg-card border border-border rounded-2xl p-6 hover:shadow-elev transition-smooth">
          <div className="w-11 h-11 rounded-lg bg-foreground text-background grid place-items-center mb-4">{f.i}</div>
          <h3 className="font-semibold mb-1">{f.t}</h3>
          <p className="text-sm text-muted-foreground">{f.d}</p>
        </div>
      ))}
    </section>
  </MarketingLayout>
);

export default Online;
