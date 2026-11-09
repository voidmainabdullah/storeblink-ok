import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { AuthPlatformError, mapAuthError } from "./auth.errors";
import type { SessionSnapshot } from "./auth.types";

type SessionListener = (snapshot: SessionSnapshot) => void;

const initialSnapshot: SessionSnapshot = {
  event: "INITIAL_SESSION",
  session: null,
  user: null,
  loading: true,
  error: null,
};

export class SessionManager {
  private snapshot = initialSnapshot;
  private readonly listeners = new Set<SessionListener>();
  private unsubscribeAuth: (() => void) | null = null;
  private initializePromise: Promise<SessionSnapshot> | null = null;
  private lifecycleVersion = 0;

  constructor(private readonly client: SupabaseClient<Database>) {}

  getSnapshot = () => this.snapshot;

  subscribe = (listener: SessionListener): (() => void) => {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  };

  private emit(
    event: AuthChangeEvent | "INITIAL_SESSION",
    session: Session | null,
    error: Error | null = null,
    lifecycleVersion = this.lifecycleVersion,
  ) {
    if (lifecycleVersion !== this.lifecycleVersion) return;
    if (
      event === "INITIAL_SESSION" &&
      this.snapshot.event === "INITIAL_SESSION" &&
      !this.snapshot.loading &&
      this.snapshot.session?.access_token === session?.access_token &&
      this.snapshot.error === error
    ) {
      return;
    }
    this.snapshot = {
      event,
      session,
      user: session?.user ?? null,
      loading: false,
      error,
    };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  initialize(): Promise<SessionSnapshot> {
    if (this.initializePromise) return this.initializePromise;
    const lifecycleVersion = ++this.lifecycleVersion;
    this.initializePromise = this.initializeInternal(lifecycleVersion);
    return this.initializePromise;
  }

  private async initializeInternal(lifecycleVersion: number): Promise<SessionSnapshot> {
    let observedAuthEvent = false;
    const authSubscription = this.client.auth.onAuthStateChange((event, session) => {
      // Keep the callback synchronous. Follow-up database work is scheduled by
      // AuthProvider after this event to avoid auth-lock deadlocks.
      observedAuthEvent = true;
      queueMicrotask(() => this.emit(event, session, null, lifecycleVersion));
    });
    this.unsubscribeAuth = () => authSubscription.data.subscription.unsubscribe();

    const current = await this.client.auth.getSession();
    if (lifecycleVersion !== this.lifecycleVersion) return this.snapshot;
    if (current.error) {
      const mapped = mapAuthError(current.error);
      this.emit("INITIAL_SESSION", null, mapped, lifecycleVersion);
      return this.snapshot;
    }

    let session = current.data.session;
    const expiresAt = session?.expires_at ?? 0;
    if (session && expiresAt <= Math.floor(Date.now() / 1000) + 30) {
      const refreshed = await this.client.auth.refreshSession();
      if (lifecycleVersion !== this.lifecycleVersion) return this.snapshot;
      if (refreshed.error || !refreshed.data.session) {
        const error = new AuthPlatformError("AUTH_SESSION_EXPIRED", {
          cause: refreshed.error,
        });
        this.emit("INITIAL_SESSION", null, error, lifecycleVersion);
        return this.snapshot;
      }
      session = refreshed.data.session;
    }

    if (!observedAuthEvent) {
      this.emit("INITIAL_SESSION", session, null, lifecycleVersion);
    }
    return this.snapshot;
  }

  dispose(): void {
    this.lifecycleVersion += 1;
    this.unsubscribeAuth?.();
    this.unsubscribeAuth = null;
    this.initializePromise = null;
    this.snapshot = initialSnapshot;
    this.listeners.clear();
  }
}
