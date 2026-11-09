import { useEffect, useRef } from "react";

export type TurnstileStatus = "loading" | "ready" | "expired" | "error";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: "light" | "dark" | "auto";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() ?? "";
const SCRIPT_ID = "storeblink-turnstile-script";
let scriptPromise: Promise<void> | null = null;

const loadTurnstile = (): Promise<void> => {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    const onLoad = () => resolve();
    const onError = () => {
      scriptPromise = null;
      script.remove();
      reject(new Error("Abuse protection could not be loaded."));
    };
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  return scriptPromise;
};

export const isTurnstileConfigured = () => Boolean(SITE_KEY);

export const TurnstileWidget = ({
  onToken,
  onStatus,
}: {
  onToken: (token: string | null) => void;
  onStatus?: (status: TurnstileStatus) => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current) return;
    onStatus?.("loading");
    let active = true;
    let widgetId: string | null = null;
    void loadTurnstile()
      .then(() => {
        if (!active || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: "auto",
          callback: (token) => {
            onToken(token);
            onStatus?.("ready");
          },
          "expired-callback": () => {
            onToken(null);
            onStatus?.("expired");
          },
          "error-callback": () => {
            onToken(null);
            onStatus?.("error");
          },
        });
      })
      .catch(() => {
        if (!active) return;
        scriptPromise = null;
        onToken(null);
        onStatus?.("error");
      });
    return () => {
      active = false;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [onStatus, onToken]);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} className="min-h-[65px]" aria-label="Abuse protection" />;
};
