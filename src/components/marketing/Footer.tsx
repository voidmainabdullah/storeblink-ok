import { Link } from "react-router-dom";
import { Logo } from "./Logo";

const groups = [
  { title: "Products", links: [["Point of Sale","/point-of-sale"],["Online","/online"],["Payments","/payments"],["Hardware","/hardware"]] },
  { title: "Business", links: [["Pricing","/pricing"],["Get started","/auth?mode=signup"],["Sign in","/auth"]] },
  { title: "Company", links: [["About","/"],["Careers","/"],["Press","/"],["Contact","/"]] },
  { title: "Resources", links: [["Help center","/"],["Developers","/"],["Status","/"],["Legal","/"]] },
];

export const Footer = () => (
  <footer className="bg-foreground text-background mt-20">
    <div className="container py-16">
      <div className="grid lg:grid-cols-5 gap-10">
        <div className="lg:col-span-1">
          <Logo inverted />
          <p className="text-background/60 text-sm mt-4 leading-relaxed">Tools to start, run and grow your business.</p>
        </div>
        {groups.map((g) => (
          <div key={g.title}>
            <h4 className="font-semibold mb-4 text-sm">{g.title}</h4>
            <ul className="space-y-3">
              {g.links.map(([label, to]) => (
                <li key={label}><Link to={to} className="text-sm text-background/60 hover:text-background transition-smooth">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-background/10 mt-12 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-background/50">
        <p>© {new Date().getFullYear()} Storeblink. A Square-inspired demo.</p>
        <div className="flex gap-6">
          <Link to="/" className="hover:text-background">Privacy</Link>
          <Link to="/" className="hover:text-background">Terms</Link>
          <Link to="/" className="hover:text-background">Cookies</Link>
        </div>
      </div>
    </div>
  </footer>
);
