import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { AuthPlatformError, mapAuthError } from "./auth.errors";
import type {
  AuthenticatorAssuranceLevel,
  MfaEnrollment,
  MfaFactorSummary,
  SignInInput,
  SignUpInput,
  SignUpResult,
} from "./auth.types";

export class AuthService {
  constructor(private readonly client: SupabaseClient<Database>) {}

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  async signUp(input: SignUpInput): Promise<SignUpResult> {
    const { data, error } = await this.run(() =>
      this.client.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          emailRedirectTo: input.emailRedirectTo,
          data: { full_name: input.fullName, business_name: input.businessName },
          ...(input.captchaToken ? { captchaToken: input.captchaToken } : {}),
        },
      }),
    );
    if (error) throw mapAuthError(error);
    return {
      user: data.user,
      session: data.session,
      requiresEmailVerification: Boolean(data.user && !data.session),
    };
  }

  async signIn(input: SignInInput) {
    const { data, error } = await this.run(() =>
      this.client.auth.signInWithPassword({
        email: input.email,
        password: input.password,
        options: input.captchaToken ? { captchaToken: input.captchaToken } : undefined,
      }),
    );
    if (error) throw mapAuthError(error);
    return data;
  }

  async signOut(): Promise<void> {
    const { error } = await this.run(() => this.client.auth.signOut());
    if (error) throw mapAuthError(error);
  }

  async requestPasswordReset(
    email: string,
    redirectTo: string,
    captchaToken?: string,
  ): Promise<void> {
    const { error } = await this.run(() =>
      this.client.auth.resetPasswordForEmail(email, {
        redirectTo,
        ...(captchaToken ? { captchaToken } : {}),
      }),
    );
    if (error) throw mapAuthError(error);
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.run(() =>
      this.client.auth.updateUser({ password }),
    );
    if (error) throw mapAuthError(error);
  }

  async getAssuranceLevel(): Promise<{
    currentLevel: AuthenticatorAssuranceLevel;
    nextLevel: AuthenticatorAssuranceLevel;
  }> {
    const { data, error } = await this.run(() =>
      this.client.auth.mfa.getAuthenticatorAssuranceLevel(),
    );
    if (error) throw mapAuthError(error);
    const normalizeLevel = (value: string | null): AuthenticatorAssuranceLevel =>
      value === "aal1" || value === "aal2" ? value : null;
    return {
      currentLevel: normalizeLevel(data.currentLevel),
      nextLevel: normalizeLevel(data.nextLevel),
    };
  }

  async requireAal2(): Promise<void> {
    const assurance = await this.getAssuranceLevel();
    if (assurance.currentLevel !== "aal2") {
      throw new AuthPlatformError("AUTH_MFA_REQUIRED");
    }
  }

  async listMfaFactors(): Promise<readonly MfaFactorSummary[]> {
    const { data, error } = await this.run(() =>
      this.client.auth.mfa.listFactors(),
    );
    if (error) throw mapAuthError(error);
    return [...data.totp, ...data.phone].map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name,
      status: factor.status,
      factorType: factor.factor_type,
    }));
  }

  async enrollTotp(friendlyName = "StoreBlink authenticator"): Promise<MfaEnrollment> {
    const { data, error } = await this.run(() =>
      this.client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName,
      }),
    );
    if (error) throw mapAuthError(error);
    return {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    };
  }

  async verifyMfa(factorId: string, code: string): Promise<void> {
    const challenge = await this.run(() =>
      this.client.auth.mfa.challenge({ factorId }),
    );
    if (challenge.error) throw mapAuthError(challenge.error);
    const verification = await this.run(() =>
      this.client.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code,
      }),
    );
    if (verification.error) throw mapAuthError(verification.error);
  }

  async unenrollMfa(factorId: string): Promise<void> {
    await this.requireAal2();
    const { error } = await this.run(() =>
      this.client.auth.mfa.unenroll({ factorId }),
    );
    if (error) throw mapAuthError(error);
    const refresh = await this.run(() => this.client.auth.refreshSession());
    if (refresh.error) throw mapAuthError(refresh.error);
  }
}
