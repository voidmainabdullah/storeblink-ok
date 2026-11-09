import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/platform/supabase/client";
import { AuthPlatformError } from "./auth.errors";
import { AuthService } from "./AuthService";
import {
  isConfirmedOnboardingBootstrap,
  OnboardingService,
  type CompleteOnboardingInput,
} from "./OnboardingService";
import { PermissionService } from "./PermissionService";
import { SessionManager } from "./SessionManager";
import type {
  AuthenticatorAssuranceLevel,
  DashboardBootstrap,
  MfaEnrollment,
  MfaFactorSummary,
  SignInInput,
  SignUpInput,
  SignUpResult,
  StoreCapability,
} from "./auth.types";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  bootstrap: DashboardBootstrap | null;
  currentStore: DashboardBootstrap["store"];
  membership: DashboardBootstrap["membership"];
  capabilities: readonly StoreCapability[];
  assuranceLevel: AuthenticatorAssuranceLevel;
  loading: boolean;
  authorizationLoading: boolean;
  error: Error | null;
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
  signIn: (input: SignInInput) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string, redirectTo: string, captchaToken?: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  hasCapability: (capability: StoreCapability) => boolean;
  requireCapability: (capability: StoreCapability) => void;
  completeOnboarding: (input: CompleteOnboardingInput) => Promise<DashboardBootstrap>;
  refreshAuthorization: () => Promise<DashboardBootstrap | null>;
  switchStore: (storeId: string) => Promise<DashboardBootstrap>;
  refreshAssuranceLevel: () => Promise<AuthenticatorAssuranceLevel>;
  listMfaFactors: () => Promise<readonly MfaFactorSummary[]>;
  enrollTotp: (friendlyName?: string) => Promise<MfaEnrollment>;
  verifyMfa: (factorId: string, code: string) => Promise<void>;
  unenrollMfa: (factorId: string) => Promise<void>;
};

const unavailable = async (): Promise<never> => {
  throw new AuthPlatformError("AUTH_SESSION_EXPIRED");
};

const publicContext: AuthContextValue = {
  user: null,
  session: null,
  bootstrap: null,
  currentStore: null,
  membership: null,
  capabilities: [],
  assuranceLevel: null,
  loading: false,
  authorizationLoading: false,
  error: null,
  signUp: unavailable,
  signIn: unavailable,
  signOut: async () => undefined,
  requestPasswordReset: unavailable,
  updatePassword: unavailable,
  hasCapability: () => false,
  requireCapability: () => {
    throw new AuthPlatformError("STORE_ACCESS_DENIED");
  },
  completeOnboarding: unavailable,
  refreshAuthorization: async () => null,
  switchStore: unavailable,
  refreshAssuranceLevel: async () => null,
  listMfaFactors: unavailable,
  enrollTotp: unavailable,
  verifyMfa: unavailable,
  unenrollMfa: unavailable,
};

const AuthContext = createContext<AuthContextValue>(publicContext);
const selectedStoreKey = (userId: string) => `storeblink:auth:store:${userId}`;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [runtime] = useState(() => {
    const client = getSupabaseBrowserClient();
    return {
      auth: new AuthService(client),
      onboarding: new OnboardingService(client),
      permissions: new PermissionService(client),
      sessions: new SessionManager(client),
    };
  });
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [bootstrap, setBootstrap] = useState<DashboardBootstrap | null>(null);
  const [assuranceLevel, setAssuranceLevel] = useState<AuthenticatorAssuranceLevel>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authorizationLoading, setAuthorizationLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const requestVersion = useRef(0);

  const loadAuthorization = useCallback(
    async (targetUser: User, preferredStoreId?: string | null, force = false) => {
      const version = ++requestVersion.current;
      setAuthorizationLoading(true);
      try {
        const storedStoreId =
          preferredStoreId ?? window.localStorage.getItem(selectedStoreKey(targetUser.id));
        const next = await runtime.permissions.getDashboardBootstrap(
          targetUser.id,
          storedStoreId,
          force,
        );
        if (version !== requestVersion.current) return null;
        setBootstrap(next);
        setError(null);
        if (next.store) window.localStorage.setItem(selectedStoreKey(targetUser.id), next.store.id);
        return next;
      } catch (nextError) {
        if (version !== requestVersion.current) return null;
        setBootstrap(null);
        setError(nextError instanceof Error ? nextError : new Error("Store authorization failed."));
        return null;
      } finally {
        if (version === requestVersion.current) setAuthorizationLoading(false);
      }
    },
    [runtime.permissions],
  );

  const refreshAssuranceLevel = useCallback(async () => {
    if (!user) {
      setAssuranceLevel(null);
      return null;
    }
    const assurance = await runtime.auth.getAssuranceLevel();
    setAssuranceLevel(assurance.currentLevel);
    return assurance.currentLevel;
  }, [runtime.auth, user]);

  useEffect(() => {
    let active = true;
    const unsubscribe = runtime.sessions.subscribe((snapshot) => {
      if (!active) return;
      setSession(snapshot.session);
      setUser(snapshot.user);
      setSessionLoading(snapshot.loading);
      if (snapshot.error) setError(snapshot.error);
      if (!snapshot.user) {
        requestVersion.current += 1;
        setBootstrap(null);
        setAssuranceLevel(null);
        setAuthorizationLoading(false);
        runtime.permissions.clear();
        return;
      }
      void loadAuthorization(
        snapshot.user,
        undefined,
        snapshot.event === "TOKEN_REFRESHED" || snapshot.event === "USER_UPDATED",
      );
      void runtime.auth.getAssuranceLevel()
        .then((value) => active && setAssuranceLevel(value.currentLevel))
        .catch(() => active && setAssuranceLevel(null));
    });
    void runtime.sessions.initialize().finally(() => active && setSessionLoading(false));
    return () => {
      active = false;
      unsubscribe();
      runtime.sessions.dispose();
    };
  }, [loadAuthorization, runtime]);

  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void loadAuthorization(user, undefined, true);
    };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadAuthorization, user]);

  const signUp = useCallback((input: SignUpInput) => runtime.auth.signUp(input), [runtime.auth]);
  const signIn = useCallback(async (input: SignInInput) => {
    await runtime.auth.signIn(input);
  }, [runtime.auth]);
  const signOut = useCallback(async () => {
    requestVersion.current += 1;
    runtime.permissions.clear(user?.id);
    setBootstrap(null);
    await runtime.auth.signOut();
  }, [runtime, user?.id]);

  const refreshAuthorization = useCallback(async () => {
    if (!user) return null;
    runtime.permissions.clear(user.id);
    return loadAuthorization(user, bootstrap?.store?.id, true);
  }, [bootstrap?.store?.id, loadAuthorization, runtime.permissions, user]);

  const completeOnboarding = useCallback(async (input: CompleteOnboardingInput) => {
    if (!user) throw new AuthPlatformError("AUTH_SESSION_EXPIRED");
    const completion = await runtime.onboarding.complete(input);
    runtime.permissions.clear(user.id);
    const next = await loadAuthorization(user, completion.storeId, true);
    if (!isConfirmedOnboardingBootstrap(completion, user.id, next)) {
      throw new AuthPlatformError("AUTH_UNKNOWN");
    }
    return next;
  }, [loadAuthorization, runtime.onboarding, runtime.permissions, user]);

  const switchStore = useCallback(async (storeId: string) => {
    if (!user) throw new AuthPlatformError("AUTH_SESSION_EXPIRED");
    runtime.permissions.clear(user.id);
    const next = await loadAuthorization(user, storeId, true);
    if (!next) throw new AuthPlatformError("STORE_ACCESS_DENIED");
    return next;
  }, [loadAuthorization, runtime.permissions, user]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    bootstrap,
    currentStore: bootstrap?.store ?? null,
    membership: bootstrap?.membership ?? null,
    capabilities: bootstrap?.capabilities ?? [],
    assuranceLevel,
    loading: sessionLoading || Boolean(user && authorizationLoading && !bootstrap && !error),
    authorizationLoading,
    error,
    signUp,
    signIn,
    signOut,
    requestPasswordReset: (email, redirectTo, captchaToken) =>
      runtime.auth.requestPasswordReset(email, redirectTo, captchaToken),
    updatePassword: (password) => runtime.auth.updatePassword(password),
    hasCapability: (capability) => runtime.permissions.can(bootstrap, capability),
    requireCapability: (capability) => runtime.permissions.require(bootstrap, capability),
    completeOnboarding,
    refreshAuthorization,
    switchStore,
    refreshAssuranceLevel,
    listMfaFactors: () => runtime.auth.listMfaFactors(),
    enrollTotp: (friendlyName) => runtime.auth.enrollTotp(friendlyName),
    verifyMfa: async (factorId, code) => {
      await runtime.auth.verifyMfa(factorId, code);
      await refreshAssuranceLevel();
    },
    unenrollMfa: async (factorId) => {
      await runtime.auth.unenrollMfa(factorId);
      await refreshAssuranceLevel();
    },
  }), [
    assuranceLevel,
    authorizationLoading,
    bootstrap,
    completeOnboarding,
    error,
    refreshAssuranceLevel,
    refreshAuthorization,
    runtime,
    session,
    sessionLoading,
    signIn,
    signOut,
    signUp,
    switchStore,
    user,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
