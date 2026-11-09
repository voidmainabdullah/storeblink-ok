import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

export const STORE_CAPABILITIES = [
  "theme.read",
  "theme.edit",
  "theme.publish",
  "theme.studio",
  "catalog.read",
  "catalog.edit",
  "orders.read",
  "orders.manage",
  "store.settings",
  "store.members",
  "domains.manage",
  "billing.manage",
  "assets.manage",
] as const;

export type StoreCapability = (typeof STORE_CAPABILITIES)[number];
export type StoreRole =
  | "owner"
  | "admin"
  | "designer"
  | "catalog_manager"
  | "support"
  | "viewer";
export type StoreMembershipStatus = "invited" | "active" | "suspended" | "revoked";
export type AuthenticatorAssuranceLevel = "aal1" | "aal2" | null;

export type AuthProfileSummary = Readonly<{
  id: string;
  fullName: string | null;
  businessName: string | null;
  onboardingCompleted: boolean;
}>;

export type AuthStoreSummary = Readonly<{
  id: string;
  name: string;
  handle: string;
  status: "draft" | "published" | "suspended" | "archived";
  currency: string;
  locale: string;
  timezone: string;
}>;

export type AuthMembership = Readonly<{
  storeId: string;
  userId: string;
  role: StoreRole;
  status: StoreMembershipStatus;
}>;

export type DashboardBootstrap = Readonly<{
  profile: AuthProfileSummary;
  store: AuthStoreSummary | null;
  membership: AuthMembership | null;
  capabilities: readonly StoreCapability[];
}>;

export type SessionSnapshot = Readonly<{
  event: AuthChangeEvent | "INITIAL_SESSION";
  session: Session | null;
  user: User | null;
  loading: boolean;
  error: Error | null;
}>;

export type SignUpInput = Readonly<{
  email: string;
  password: string;
  fullName: string;
  businessName: string;
  emailRedirectTo: string;
  captchaToken?: string;
}>;

export type SignInInput = Readonly<{
  email: string;
  password: string;
  captchaToken?: string;
}>;

export type SignUpResult = Readonly<{
  user: User | null;
  session: Session | null;
  requiresEmailVerification: boolean;
}>;

export type MfaFactorSummary = Readonly<{
  id: string;
  friendlyName?: string;
  status: string;
  factorType: string;
}>;

export type MfaEnrollment = Readonly<{
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}>;

export type SensitiveOperation =
  | "store.delete"
  | "store.transfer"
  | "store.members"
  | "domains.manage"
  | "billing.manage"
  | "data.export";
