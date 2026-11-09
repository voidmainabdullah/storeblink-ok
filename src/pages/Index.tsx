import { Link } from "react-router-dom";
import { ArrowRight, CreditCard, Smartphone, Globe, BarChart3, Shield, Zap, Check } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import heroImg from "@/assets/hero-merchant.jpg";
import posImg from "@/assets/pos-stand.jpg";
import onlineImg from "@/assets/online-seller.jpg";

const Index = () => {
  return (
    <MarketingLayout>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-hero">
        <div className="container pt-12 pb-20 lg:pt-20 lg:pb-32 grid lg:grid-cols-2 gap-12 items-center">
          <div className="animate-fade-up">
            <span className="inline-block px-3 py-1 rounded-full bg-foreground/5 border border-foreground/10 text-xs font-medium tracking-wide uppercase mb-6">
              All-in-one for sellers
            </span>
            <h1 className="text-display mb-6">
              Tools to run your <span className="italic font-normal">whole</span> business.
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mb-8 leading-relaxed">
              Take payments, sell anywhere, and manage everything in one place. Storeblink brings POS, online store, and payments together — beautifully.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="group">
                <Link to="/auth?mode=signup">Get started free <ArrowRight className="ml-1 group-hover:translate-x-1 transition-smooth" size={18} /></Link>
              </Button>
              <Button asChild size="lg" variant="outline"><Link to="/pricing">View pricing</Link></Button>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-2"><Check size={16} className="text-brand-mint" />No monthly fee</span>
              <span className="flex items-center gap-2"><Check size={16} className="text-brand-mint" />Setup in minutes</span>
              <span className="flex items-center gap-2"><Check size={16} className="text-brand-mint" />Free reader included</span>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -top-6 -left-6 w-32 h-32 bg-brand-coral/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-6 -right-6 w-40 h-40 bg-brand-violet/20 rounded-full blur-3xl" />
            <img src={heroImg} alt="Cafe owner taking a contactless payment with Storeblink" width={1600} height={1200} className="relative rounded-2xl shadow-elev w-full" />
            <div className="absolute -bottom-6 left-6 bg-card rounded-xl shadow-elev px-5 py-4 flex items-center gap-3 animate-float">
              <div className="w-10 h-10 rounded-full bg-gradient-mint grid place-items-center text-white font-bold">$</div>
              <div>
                <div className="text-xs text-muted-foreground">Sale completed</div>
                <div className="font-semibold">$48.20 · Tap to pay</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUSTED BY MARQUEE */}
      <section className="py-10 border-y border-border bg-background overflow-hidden">
        <div className="text-center text-xs uppercase tracking-widest text-muted-foreground mb-6">Trusted by millions of sellers</div>
        <div className="flex animate-marquee gap-16 whitespace-nowrap">
          {[..."Brewly · Loomstead · NorthPine · Olive&Co · Bitwave · Maker Studio · Hilo · CityBakery · Field Notes · Cobalt".split("·"), ..."Brewly · Loomstead · NorthPine · Olive&Co · Bitwave · Maker Studio · Hilo · CityBakery · Field Notes · Cobalt".split("·")].map((b, i) => (
            <span key={i} className="text-2xl font-bold text-foreground/20 tracking-tight">{b.trim()}</span>
          ))}
        </div>
      </section>

      {/* PRODUCT CARDS */}
      <section className="container py-24">
        <div className="max-w-2xl mb-14">
          <h2 className="text-headline mb-4">One platform. Every way to sell.</h2>
          <p className="text-lg text-muted-foreground">From the counter to checkout to your phone — Storeblink connects every part of your business.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <ProductCard
            tag="Point of Sale"
            title="A POS that runs your front of house."
            desc="Ring up sales, manage tabs, split checks, and print receipts. All on one beautifully simple device."
            to="/point-of-sale"
            img={posImg}
            tone="bg-brand-sand"
          />
          <ProductCard
            tag="Online"
            title="An online store, ready in minutes."
            desc="Free website, product pages, and checkout that syncs with your inventory automatically."
            to="/online"
            img={onlineImg}
            tone="bg-brand-cream"
          />
          <FeatureCard tone="bg-foreground text-background" tag="Payments" title="Get paid in every way." to="/payments" icon={<CreditCard />}>
            Accept cards, taps, chips, gift cards, and invoices — at the same low rate.
          </FeatureCard>
          <FeatureCard tone="bg-gradient-coral text-background" tag="Hardware" title="Beautiful hardware, built for you." to="/hardware" icon={<Smartphone />}>
            Sleek readers, stands, and terminals designed to disappear into your counter.
          </FeatureCard>
        </div>
      </section>

      {/* STATS BAND */}
      <section className="bg-foreground text-background py-20">
        <div className="container grid md:grid-cols-3 gap-10 text-center">
          {[
            { k: "4M+", v: "Sellers worldwide" },
            { k: "$200B", v: "Processed annually" },
            { k: "99.99%", v: "Uptime guarantee" },
          ].map((s) => (
            <div key={s.k}>
              <div className="text-6xl font-semibold tracking-tighter mb-2">{s.k}</div>
              <div className="text-background/60">{s.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURE GRID */}
      <section className="container py-24">
        <h2 className="text-headline mb-14 max-w-xl">Everything you need, nothing you don't.</h2>
        <div className="grid md:grid-cols-3 gap-x-10 gap-y-12">
          {[
            { i: <Globe size={24} />, t: "Sell anywhere", d: "In person, online, on the go, on social — same inventory, same dashboard." },
            { i: <BarChart3 size={24} />, t: "Real-time insights", d: "Track sales, customers, and inventory the moment they change." },
            { i: <Shield size={24} />, t: "Bank-grade security", d: "PCI compliance, fraud protection, and dispute management built in." },
            { i: <Zap size={24} />, t: "Fast deposits", d: "Get your money as soon as the next business day. No surprises." },
            { i: <CreditCard size={24} />, t: "Transparent pricing", d: "One simple rate per dip, tap, or swipe. No monthly fees." },
            { i: <Smartphone size={24} />, t: "Works on any device", d: "iOS, Android, web — the dashboard goes wherever you do." },
          ].map((f) => (
            <div key={f.t}>
              <div className="w-12 h-12 rounded-xl bg-foreground text-background grid place-items-center mb-4">{f.i}</div>
              <h3 className="font-semibold text-lg mb-2">{f.t}</h3>
              <p className="text-muted-foreground leading-relaxed">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-24">
        <div className="bg-gradient-violet rounded-3xl p-12 lg:p-20 text-center text-background relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-coral/30 rounded-full blur-3xl" />
          <div className="relative">
            <h2 className="text-headline mb-4">Start selling today.</h2>
            <p className="text-background/80 max-w-lg mx-auto mb-8">Create your free account and take your first payment in minutes.</p>
            <Button asChild size="lg" variant="secondary" className="bg-background text-foreground hover:bg-background/90">
              <Link to="/auth?mode=signup">Create free account</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
};

const ProductCard = ({ tag, title, desc, to, img, tone }: { tag: string; title: string; desc: string; to: string; img: string; tone: string }) => (
  <Link to={to} className={`group ${tone} rounded-3xl p-8 lg:p-10 overflow-hidden relative transition-smooth hover:shadow-elev`}>
    <div className="text-xs uppercase tracking-widest font-semibold mb-3 opacity-70">{tag}</div>
    <h3 className="text-2xl lg:text-3xl font-semibold tracking-tight mb-3 max-w-sm">{title}</h3>
    <p className="text-foreground/70 mb-6 max-w-md">{desc}</p>
    <span className="inline-flex items-center gap-2 font-medium">Learn more <ArrowRight size={16} className="group-hover:translate-x-1 transition-smooth" /></span>
    <img src={img} alt="" loading="lazy" className="mt-8 rounded-xl w-full h-56 object-cover" />
  </Link>
);

const FeatureCard = ({ tag, title, to, icon, children, tone }: any) => (
  <Link to={to} className={`group ${tone} rounded-3xl p-8 lg:p-10 transition-smooth hover:shadow-pop relative overflow-hidden`}>
    <div className="w-12 h-12 rounded-xl bg-background/15 grid place-items-center mb-6">{icon}</div>
    <div className="text-xs uppercase tracking-widest font-semibold mb-2 opacity-70">{tag}</div>
    <h3 className="text-2xl lg:text-3xl font-semibold tracking-tight mb-3 max-w-sm">{title}</h3>
    <p className="opacity-80 mb-6 max-w-md">{children}</p>
    <span className="inline-flex items-center gap-2 font-medium">Explore <ArrowRight size={16} className="group-hover:translate-x-1 transition-smooth" /></span>
  </Link>
);

export default Index;
