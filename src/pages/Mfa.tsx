import { useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import type { MfaEnrollment, MfaFactorSummary } from "@/platform/auth";

const safeReturnTo = (value: string | null) =>
  value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";

const Mfa = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = useMemo(() => safeReturnTo(params.get("returnTo")), [params]);
  const [factors, setFactors] = useState<readonly MfaFactorSummary[]>([]);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const isDomainAccess = returnTo.startsWith("/domain/connect");
  const isPlatformAdminAccess = returnTo.startsWith("/main-admin");

  useEffect(() => {
    if (auth.assuranceLevel === "aal2") {
      navigate(returnTo, { replace: true });
      return;
    }
    let active = true;
    void auth.listMfaFactors()
      .then((value) => active && setFactors(value.filter((factor) => factor.status === "verified")))
      .catch((nextError) => active && setError(nextError instanceof Error ? nextError.message : "MFA could not be loaded."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [auth, navigate, returnTo]);

  const factorId = factors[0]?.id ?? enrollment?.factorId ?? null;

  const beginEnrollment = async () => {
    setLoading(true);
    setError(null);
    try {
      setEnrollment(await auth.enrollTotp());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Authenticator enrollment failed.");
    } finally {
      setLoading(false);
    }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) return;
    setLoading(true);
    setError(null);
    try {
      await auth.verifyMfa(factorId, code);
      navigate(returnTo, { replace: true });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The verification code is invalid.");
    } finally {
      setLoading(false);
    }
  };

  const copySecret = async () => {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setSecretCopied(true);
      window.setTimeout(() => setSecretCopied(false), 2_000);
    } catch {
      setError("The setup key could not be copied. Select it manually instead.");
    }
  };

  const heading = isDomainAccess
    ? "Secure domain access"
    : isPlatformAdminAccess
      ? "Secure platform administration"
      : "Two-step verification";
  const explanation = isDomainAccess
    ? "Domain, DNS, and SSL changes require a second factor so a stolen password alone cannot redirect your storefront."
    : isPlatformAdminAccess
      ? "Platform operations require a second factor before cross-store status can be accessed."
      : "Protect sensitive account actions with a time-based authenticator code.";

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-foreground text-background">
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{heading}</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{explanation}</p>
          </div>
        </div>

        {!factorId ? (
          <div className="mt-5 rounded-md border bg-muted/30 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Smartphone size={16} aria-hidden="true" />How setup works
            </h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-5 text-muted-foreground">
              <li>Open Google Authenticator, Microsoft Authenticator, Authy, or 1Password on your phone.</li>
              <li>Select Add account, then choose Scan QR code. Do not use a payment app.</li>
              <li>Scan the QR code StoreBlink shows, then enter the current six-digit code to verify setup.</li>
            </ol>
          </div>
        ) : null}

        {enrollment ? (
          <div className="mt-5 rounded-md border p-4">
            <h2 className="text-sm font-semibold">Scan this QR code</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Keep this page open, scan from the authenticator app, then type the changing six-digit code below.
            </p>
            <img src={enrollment.qrCode} alt="StoreBlink authenticator setup QR code" className="mx-auto mt-4 h-44 w-44" />
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-xs font-medium"><KeyRound size={13} />Manual setup key</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => void copySecret()}>
                  {secretCopied ? <Check className="mr-1.5" size={13} /> : <Copy className="mr-1.5" size={13} />}
                  {secretCopied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="mt-1 break-all rounded bg-muted px-2 py-2 font-mono text-xs text-muted-foreground">
                {enrollment.secret}
              </p>
            </div>
            <p className="mt-4 rounded-md bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
              Scanning only adds StoreBlink to your authenticator. It does not connect a domain, change DNS, or charge you. After the six-digit code is verified, this browser session is upgraded to AAL2 and returns to {isDomainAccess ? "Domain Connect" : isPlatformAdminAccess ? "Main Admin" : "the requested page"}.
            </p>
          </div>
        ) : null}

        {factorId ? (
          <form onSubmit={verify} className="mt-5 space-y-4">
            <div>
              <Label htmlFor="mfa-code">Six-digit verification code</Label>
              <Input id="mfa-code" className="mt-1" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} autoFocus />
              {!enrollment ? (
                <div className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                  <p>Open the authenticator app you previously connected and enter its current StoreBlink code.</p>
                  <p>The QR code appears only during first-time setup. This account already has a verified authenticator, so it is not shown again.</p>
                </div>
              ) : null}
            </div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>{loading ? "Verifying..." : "Verify"}</Button>
          </form>
        ) : (
          <div className="mt-5">
            {error ? <p role="alert" className="mb-3 text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" onClick={() => void beginEnrollment()} disabled={loading}>{loading ? "Loading..." : "Set up authenticator"}</Button>
          </div>
        )}
        <Button variant="ghost" className="mt-2 w-full" onClick={() => void auth.signOut()}>Sign out</Button>
      </div>
    </div>
  );
};

export default Mfa;
