import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/marketing/Logo";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { mapAuthError } from "@/platform/auth";
import {
  isTurnstileConfigured,
  TurnstileWidget,
  type TurnstileStatus,
} from "@/platform/auth/TurnstileWidget";
import { productionUrl } from "@/platform/runtime/productionOrigin";

type AuthMode = "signin" | "signup" | "reset" | "update-password";

class AuthFormValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthFormValidationError";
  }
}

const signUpSchema = z.object({
  fullName: z.string().trim().min(1, "Name required").max(100),
  businessName: z.string().trim().min(1, "Business name required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string()
    .min(10, "Use at least 10 characters")
    .max(128)
    .regex(/[a-z]/, "Add a lowercase letter")
    .regex(/[A-Z]/, "Add an uppercase letter")
    .regex(/[0-9]/, "Add a number"),
});
const signInSchema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(1, "Password required").max(128),
});

const safeReturnTo = (value: string | null) =>
  value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";

const Auth = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const { toast } = useToast();
  const requestedMode = params.get("mode");
  const [mode, setMode] = useState<AuthMode>(
    requestedMode === "signup" || requestedMode === "reset" || requestedMode === "update-password"
      ? requestedMode
      : "signin",
  );
  const [submitting, setSubmitting] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaStatus, setCaptchaStatus] = useState<TurnstileStatus>("loading");
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName: "", businessName: "", email: "", password: "" });
  const returnTo = useMemo(() => safeReturnTo(params.get("returnTo")), [params]);

  useEffect(() => {
    if (auth.loading || !auth.user || mode === "update-password") return;
    if (auth.assuranceLevel === "aal1") {
      void auth.listMfaFactors().then((factors) => {
        const hasVerifiedFactor = factors.some((factor) => factor.status === "verified");
        navigate(hasVerifiedFactor ? `/auth/mfa?returnTo=${encodeURIComponent(returnTo)}` : returnTo, { replace: true });
      }).catch(() => navigate(returnTo, { replace: true }));
      return;
    }
    navigate(returnTo, { replace: true });
  }, [auth, mode, navigate, returnTo]);

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setVerificationSent(false);
    setCaptchaToken(null);
    setCaptchaStatus("loading");
    setCaptchaAttempt((attempt) => attempt + 1);
    setSubmitError(null);
    const next = new URLSearchParams(params);
    if (nextMode === "signin") next.delete("mode");
    else next.set("mode", nextMode);
    setParams(next, { replace: true });
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isTurnstileConfigured() && !captchaToken && mode !== "update-password") {
      setSubmitError(
        captchaStatus === "error"
          ? "Security verification could not load. Retry the check below."
          : "Security verification is still loading. Please wait a moment.",
      );
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const parsed = signUpSchema.safeParse(form);
        if (!parsed.success) throw new AuthFormValidationError(parsed.error.issues[0].message);
        const callback = productionUrl(`/auth/callback?returnTo=${encodeURIComponent(returnTo)}`);
        const result = await auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          fullName: parsed.data.fullName,
          businessName: parsed.data.businessName,
          emailRedirectTo: callback,
          ...(captchaToken ? { captchaToken } : {}),
        });
        if (result.requiresEmailVerification) {
          setVerificationSent(true);
          toast({ title: "Check your email", description: "Open the verification link to finish creating your account." });
        } else {
          navigate(returnTo, { replace: true });
        }
      } else if (mode === "signin") {
        const parsed = signInSchema.safeParse(form);
        if (!parsed.success) throw new AuthFormValidationError(parsed.error.issues[0].message);
        await auth.signIn({
          email: parsed.data.email,
          password: parsed.data.password,
          ...(captchaToken ? { captchaToken } : {}),
        });
        const factors = await auth.listMfaFactors();
        const hasVerifiedFactor = factors.some((factor) => factor.status === "verified");
        navigate(hasVerifiedFactor ? `/auth/mfa?returnTo=${encodeURIComponent(returnTo)}` : returnTo, { replace: true });
      } else if (mode === "reset") {
        const parsed = z.string().trim().email("Invalid email").safeParse(form.email);
        if (!parsed.success) throw new AuthFormValidationError(parsed.error.issues[0].message);
        await auth.requestPasswordReset(
          parsed.data,
          productionUrl(`/auth?mode=update-password&returnTo=${encodeURIComponent(returnTo)}`),
          captchaToken ?? undefined,
        );
        toast({ title: "Check your email", description: "If the account exists, a reset link has been sent." });
      } else {
        const password = signUpSchema.shape.password.safeParse(form.password);
        if (!password.success) throw new AuthFormValidationError(password.error.issues[0].message);
        await auth.updatePassword(password.data);
        toast({ title: "Password updated" });
        navigate(returnTo, { replace: true });
      }
    } catch (error) {
      const normalized = error instanceof AuthFormValidationError
        ? error
        : mapAuthError(error);
      setSubmitError(normalized.message);
      toast({ title: "Authentication failed", description: normalized.message, variant: "destructive" });
      setCaptchaToken(null);
      setCaptchaStatus("loading");
      setCaptchaAttempt((attempt) => attempt + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const heading = verificationSent
    ? "Verify your email"
    : mode === "signup"
      ? "Create your account"
      : mode === "reset"
        ? "Reset your password"
        : mode === "update-password"
          ? "Choose a new password"
          : "Welcome back";

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="relative hidden min-h-screen overflow-hidden bg-cover bg-center bg-no-repeat p-10 text-background lg:flex lg:flex-col lg:justify-between"
         style={{
      backgroundImage:
        "linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.55)), url('/eye.png')",
    }}
    >
        <Logo inverted />
        <div>
          <h2 className="mb-4 max-w-md text-headline">Run your business with StoreBlink.</h2>
          <p className="max-w-md text-background/70">Manage your catalog, storefront, and orders from one secure workspace.</p>
        </div>
        <p className="text-xs text-background/40">(c) {new Date().getFullYear()} StoreBlink</p>
      </div>

      <div className="flex flex-col p-6 sm:p-10">
        <div className="mb-8 lg:hidden"><Logo /></div>
        <div className="grid flex-1 place-items-center">
          <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
            <div>
              <h1 className="mb-1 text-3xl font-semibold tracking-tight">{heading}</h1>
              <p className="text-sm text-muted-foreground">
                {verificationSent
                  ? "Use the link in your inbox, then return here to sign in."
                  : mode === "signup"
                    ? "Start selling in minutes."
                    : mode === "reset"
                      ? "We will send a secure recovery link."
                      : mode === "update-password"
                        ? "Use a password you do not use elsewhere."
                        : "Sign in to your dashboard."}
              </p>
            </div>

            {!verificationSent && mode === "signup" ? (
              <>
                <div><Label htmlFor="fullName">Full name</Label><Input id="fullName" autoComplete="name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required maxLength={100} /></div>
                <div><Label htmlFor="businessName">Business name</Label><Input id="businessName" autoComplete="organization" value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} required maxLength={100} /></div>
              </>
            ) : null}
            {!verificationSent && mode !== "update-password" ? (
              <div><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required maxLength={255} /></div>
            ) : null}
            {!verificationSent && mode !== "reset" ? (
              <div><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required maxLength={128} /></div>
            ) : null}

            {!verificationSent && mode !== "update-password" ? (
              <>
                <TurnstileWidget
                  key={`${mode}-${captchaAttempt}`}
                  onToken={setCaptchaToken}
                  onStatus={setCaptchaStatus}
                />
                {captchaStatus === "error" ? (
                  <div role="alert" className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    Security check could not load. Check your connection and retry.
                    <button
                      type="button"
                      className="ml-1 font-semibold underline underline-offset-2"
                      onClick={() => {
                        setCaptchaStatus("loading");
                        setCaptchaAttempt((attempt) => attempt + 1);
                      }}
                    >
                      Retry
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            {submitError ? (
              <div
                role="alert"
                aria-live="polite"
                className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {submitError}
              </div>
            ) : null}

            {!verificationSent ? (
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={submitting || (isTurnstileConfigured() && mode !== "update-password" && !captchaToken)}
              >
                {submitting
                  ? "Please wait..."
                  : isTurnstileConfigured() && mode !== "update-password" && !captchaToken
                    ? "Checking security..."
                  : mode === "signup"
                    ? "Create account"
                    : mode === "reset"
                      ? "Send reset link"
                      : mode === "update-password"
                        ? "Update password"
                        : "Sign in"}
              </Button>
            ) : null}

            {mode === "signin" && !verificationSent ? (
              <button type="button" onClick={() => changeMode("reset")} className="block w-full text-center text-sm text-muted-foreground hover:text-foreground hover:underline">
                Forgot your password?
              </button>
            ) : null}
            <p className="text-center text-sm text-muted-foreground">
              {mode === "signup" ? "Already have an account? " : ""}
              <button type="button" onClick={() => changeMode(mode === "signup" ? "signin" : mode === "signin" ? "signup" : "signin")} className="font-semibold text-foreground hover:underline">
                {mode === "signup" ? "Sign in" : mode === "signin" ? "Create one" : "Back to sign in"}
              </button>
            </p>
            <p className="text-center text-xs text-muted-foreground"><Link to="/" className="hover:underline">Back to home</Link></p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Auth;
