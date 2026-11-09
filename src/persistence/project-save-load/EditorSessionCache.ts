import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { Point, SceneTree } from "@/types";

export type EditorWarmSession<
  TProfile = unknown,
  TItem = unknown,
  TPageSnapshot = unknown,
> = Readonly<{
  storeId: string;
  scene: SceneTree;
  profile: TProfile;
  storeItems: readonly TItem[];
  storeSlug: string;
  pageSnapshot: TPageSnapshot;
  serverRevision: number;
  dirty: boolean;
  activeBreakpoint: ResponsiveBreakpoint;
  viewport: Readonly<{
    zoom: number;
    pan: Point;
  }>;
  updatedAt: number;
}>;

const MAX_SESSIONS = 4;
const SESSION_TTL_MS = 30 * 60 * 1000;

export class EditorSessionCache {
  private readonly sessions = new Map<string, EditorWarmSession>();

  get(storeId: string, now = Date.now()): EditorWarmSession | null {
    const session = this.sessions.get(storeId);
    if (!session) return null;
    if (now - session.updatedAt > SESSION_TTL_MS) {
      this.sessions.delete(storeId);
      return null;
    }
    this.sessions.delete(storeId);
    this.sessions.set(storeId, session);
    return session;
  }

  put<TProfile, TItem, TPageSnapshot>(
    session: EditorWarmSession<TProfile, TItem, TPageSnapshot>,
  ): void {
    this.sessions.delete(session.storeId);
    this.sessions.set(session.storeId, session as EditorWarmSession);
    while (this.sessions.size > MAX_SESSIONS) {
      const oldest = this.sessions.keys().next().value as string | undefined;
      if (!oldest) break;
      this.sessions.delete(oldest);
    }
  }

  clear(storeId?: string): void {
    if (storeId) this.sessions.delete(storeId);
    else this.sessions.clear();
  }

  size(): number {
    return this.sessions.size;
  }
}

export const editorSessionCache = new EditorSessionCache();
