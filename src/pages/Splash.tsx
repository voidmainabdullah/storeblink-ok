import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BrandLogo } from "@/components/marketing/Logo";

const Splash = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const dest = sessionStorage.getItem("splash_next") || "/dashboard";
    sessionStorage.removeItem("splash_next");
    const t = setTimeout(() => navigate(dest, { replace: true }), 2600);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#faf8f3] flex items-center justify-center">
      {/* soft gradient wash */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full blur-3xl opacity-60"
             style={{ background: "radial-gradient(circle, #ffe7d6 0%, transparent 70%)" }} />
        <div className="absolute -bottom-40 -right-40 w-[560px] h-[560px] rounded-full blur-3xl opacity-60"
             style={{ background: "radial-gradient(circle, #e8ecff 0%, transparent 70%)" }} />
        <div className="absolute inset-0"
             style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.4), rgba(250,248,243,0.1))" }} />
      </div>

      <div className="relative w-[min(82vw,28rem)] splash-rise">
        <BrandLogo className="w-full splash-logo-pop" />
        <div className="splash-underline mt-3 h-[2px] bg-neutral-900/80 origin-left" />
      </div>

      {/* progress dot */}
      <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-1.5 opacity-70">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-900 splash-dot" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-900 splash-dot" style={{ animationDelay: "160ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-900 splash-dot" style={{ animationDelay: "320ms" }} />
      </div>

      <style>{`
        @keyframes splashRise {
          0% { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes splashPop {
          0% { opacity: 0; transform: scale(0.6) rotate(-8deg); filter: blur(4px); }
          60% { opacity: 1; transform: scale(1.06) rotate(0deg); filter: blur(0); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes splashUnderline {
          0% { transform: scaleX(0); }
          100% { transform: scaleX(1); }
        }
        @keyframes splashDot {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-3px); }
        }
        .splash-rise { animation: splashRise 700ms cubic-bezier(0.2,0.8,0.2,1) both; }
        .splash-logo-pop { animation: splashPop 900ms cubic-bezier(0.2,0.8,0.2,1) both; }
        .splash-underline { animation: splashUnderline 700ms 700ms cubic-bezier(0.2,0.8,0.2,1) both; }
        .splash-dot { animation: splashDot 1.2s ease-in-out infinite; }
      `}</style>
    </div>
  );
};

export default Splash;
