import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Check, ArrowRight } from "lucide-react";
import posImg from "@/assets/pos-stand.jpg";

const features = [
  "Sell items, manage inventory, track tax",
  "Split checks, tabs, and tips",
  "Print or email receipts instantly",
  "Offline mode — sell even when WiFi drops",
  "Built-in customer profiles",
  "Sync with online store automatically",
];

const PointOfSale = () => (
  <MarketingLayout>
    <section className="bg-brand-sand">
      <div className="container py-20 lg:py-28 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <span className="text-xs uppercase tracking-widest font-semibold opacity-70">Storeblink POS</span>
          <h1 className="text-display mt-3 mb-6">The point of sale that runs your business.</h1>
          <p className="text-lg text-muted-foreground mb-8">From quick taps to complex orders, Storeblink POS keeps your line moving and your numbers up to date.</p>
          <div className="flex gap-3">
            <Button asChild size="lg"><Link to="/auth?mode=signup">Try it free</Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/pricing">See plans</Link></Button>
          </div>
        </div>
        <img src={posImg} alt="POS tablet on cafe counter" loading="lazy" className="rounded-2xl shadow-elev" />
      </div>
    </section>

    <section className="container py-24">
      <h2 className="text-headline max-w-2xl mb-12">Built to handle every kind of sale.</h2>
      <div className="grid md:grid-cols-2 gap-x-12 gap-y-6">
        {features.map((f) => (
          <div key={f} className="flex items-start gap-3 py-4 border-b border-border">
            <Check className="text-brand-mint mt-1" size={20} />
            <span className="font-medium">{f}</span>
          </div>
        ))}
      </div>
    </section>

    <section className="bg-foreground text-background py-20">
      <div className="container text-center">
        <h2 className="text-headline mb-4">Ready in 5 minutes.</h2>
        <p className="text-background/70 mb-8">Sign up, plug in a reader, and take your first payment.</p>
        <Button asChild size="lg" variant="secondary" className="bg-background text-foreground hover:bg-background/90">
          <Link to="/auth?mode=signup">Get started <ArrowRight size={16} className="ml-1" /></Link>
        </Button>
      </div>
    </section>
  </MarketingLayout>
);

export default PointOfSale;
