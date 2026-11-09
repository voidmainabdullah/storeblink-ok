import { describe, expect, it, vi } from "vitest";
import { SessionManager } from "./SessionManager";

const session = (expiresAt: number, id = "user-1") => ({
  access_token: "access",
  refresh_token: "refresh",
  expires_in: 3600,
  expires_at: expiresAt,
  token_type: "bearer",
  user: { id },
});

const authClient = (initialSession: unknown) => {
  let callback: ((event: string, value: unknown) => void) | null = null;
  const unsubscribe = vi.fn();
  const auth = {
    onAuthStateChange: vi.fn((nextCallback) => {
      callback = nextCallback;
      return { data: { subscription: { unsubscribe } } };
    }),
    getSession: vi.fn(async () => ({ data: { session: initialSession }, error: null })),
    refreshSession: vi.fn(async () => ({ data: { session: initialSession }, error: null })),
  };
  return {
    client: { auth } as any,
    auth,
    emit: (event: string, value: unknown) => callback?.(event, value),
    unsubscribe,
  };
};

describe("SessionManager", () => {
  it("initializes once and publishes auth state changes", async () => {
    const fixture = authClient(session(Math.floor(Date.now() / 1000) + 3600));
    const manager = new SessionManager(fixture.client);
    const listener = vi.fn();
    manager.subscribe(listener);

    await manager.initialize();
    expect(manager.getSnapshot()).toMatchObject({ loading: false, user: { id: "user-1" } });
    expect(fixture.auth.getSession).toHaveBeenCalledTimes(1);

    fixture.emit("SIGNED_OUT", null);
    await Promise.resolve();
    expect(manager.getSnapshot()).toMatchObject({ event: "SIGNED_OUT", user: null });
  });

  it("refreshes an expiring session and reports an expired refresh", async () => {
    const fixture = authClient(session(Math.floor(Date.now() / 1000) - 1));
    fixture.auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: "refresh token expired" },
    });
    const manager = new SessionManager(fixture.client);

    await manager.initialize();
    expect(fixture.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot().error).toMatchObject({ code: "AUTH_SESSION_EXPIRED" });
    expect(manager.getSnapshot().user).toBeNull();
  });

  it("re-subscribes after disposal for React Strict Mode effect replay", async () => {
    const fixture = authClient(session(Math.floor(Date.now() / 1000) + 3600));
    const manager = new SessionManager(fixture.client);
    await manager.initialize();
    manager.dispose();
    manager.subscribe(() => undefined);
    await manager.initialize();

    expect(fixture.unsubscribe).toHaveBeenCalledTimes(1);
    expect(fixture.auth.onAuthStateChange).toHaveBeenCalledTimes(2);
    expect(fixture.auth.getSession).toHaveBeenCalledTimes(2);
  });

  it("publishes one initial snapshot when Supabase and getSession resolve together", async () => {
    const initial = session(Math.floor(Date.now() / 1000) + 3600);
    const fixture = authClient(initial);
    let resolveSession: ((value: unknown) => void) | null = null;
    fixture.auth.getSession.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSession = resolve;
    }));
    const manager = new SessionManager(fixture.client);
    const listener = vi.fn();
    manager.subscribe(listener);

    const initializing = manager.initialize();
    fixture.emit("INITIAL_SESSION", initial);
    resolveSession?.({ data: { session: initial }, error: null });
    await initializing;
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot()).toMatchObject({ loading: false, user: { id: "user-1" } });
  });

  it("ignores a stale initialization after Strict Mode disposal and replay", async () => {
    const stale = session(Math.floor(Date.now() / 1000) + 3600, "stale-user");
    const fresh = session(Math.floor(Date.now() / 1000) + 3600, "fresh-user");
    const fixture = authClient(stale);
    let resolveStale: ((value: unknown) => void) | null = null;
    fixture.auth.getSession
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveStale = resolve;
      }))
      .mockResolvedValueOnce({ data: { session: fresh }, error: null });
    const manager = new SessionManager(fixture.client);

    const staleInitialization = manager.initialize();
    manager.dispose();
    manager.subscribe(() => undefined);
    await manager.initialize();
    resolveStale?.({ data: { session: stale }, error: null });
    await staleInitialization;

    expect(manager.getSnapshot()).toMatchObject({ loading: false, user: { id: "fresh-user" } });
  });
});
