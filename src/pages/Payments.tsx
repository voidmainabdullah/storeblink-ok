import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { CreditCard, Wifi, Receipt, RefreshCw } from "lucide-react";

const Payments = () => (
  <MarketingLayout>
    <section className="bg-gradient-ink text-background">
      <div className="container py-24 lg:py-32 text-center">
        <span className="text-xs uppercase tracking-widest font-semibold opacity-70">Storeblink Payments</span>
        <h1 className="text-display mt-3 mb-6 max-w-3xl mx-auto">One rate. Every way to pay.</h1>
        <p className="text-lg text-background/70 max-w-xl mx-auto mb-8">Accept cards, taps, chips, Apple Pay, Google Pay, gift cards, and invoices — at <span className="font-semibold text-background">2.6% + 10¢</span> per swipe.</p>
        <Button asChild size="lg" variant="secondary" className="bg-background text-foreground hover:bg-background/90">
          <Link to="/auth?mode=signup">Start accepting payments</Link>
        </Button>
      </div>
    </section>

    <section className="container py-24 grid md:grid-cols-2 gap-6">
      {[
        { i: <CreditCard />, t: "All major cards", d: "Visa, Mastercard, Amex, Discover, plus contactless wallets." },
        { i: <Wifi />, t: "Tap to Pay", d: "Use just your phone — no extra hardware required." },
        { i: <Receipt />, t: "Invoices", d: "Send professional invoices and get paid online." },
        { i: <RefreshCw />, t: "Recurring billing", d: "Set up subscriptions and automatic charges." },
      ].map((f) => (
        <div key={f.t} className="bg-brand-cream rounded-2xl p-8 border border-border">
          <div className="w-12 h-12 rounded-xl bg-foreground text-background grid place-items-center mb-4">{f.i}</div>
          <h3 className="text-xl font-semibold mb-2">{f.t}</h3>
          <p className="text-muted-foreground">{f.d}</p>
        </div>
      ))}
    </section>
  </MarketingLayout>
);

export default Payments;
