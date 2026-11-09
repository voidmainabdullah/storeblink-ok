export type CacheEntryOptions = {
  tags?: readonly string[];
  ttlMs?: number;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  tags: Set<string>;
};

export type TaggedCacheOptions = {
  maxEntries?: number;
  defaultTtlMs?: number;
  now?: () => number;
};

export class TaggedCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly tagIndex = new Map<string, Set<string>>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private readonly now: () => number;

  constructor(options: TaggedCacheOptions = {}) {
    this.maxEntries = Math.max(1, options.maxEntries ?? 200);
    this.defaultTtlMs = Math.max(0, options.defaultTtlMs ?? 30_000);
    this.now = options.now ?? Date.now;
  }

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.delete(key);
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value as T;
  }

  set<T>(key: string, value: T, options: CacheEntryOptions = {}): T {
    this.delete(key);
    const ttlMs = Math.max(0, options.ttlMs ?? this.defaultTtlMs);
    const tags = new Set(options.tags ?? []);
    this.entries.set(key, {
      value,
      expiresAt: this.now() + ttlMs,
      tags,
    });
    tags.forEach((tag) => {
      const keys = this.tagIndex.get(tag) ?? new Set<string>();
      keys.add(key);
      this.tagIndex.set(tag, keys);
    });
    this.evictLeastRecentlyUsed();
    return value;
  }

  async getOrLoad<T>(
    key: string,
    loader: () => Promise<T>,
    options: CacheEntryOptions = {},
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight as Promise<T>;

    const request = loader()
      .then((value) => this.set(key, value, options))
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, request);
    return request;
  }

  invalidateTag(tag: string): number {
    const keys = [...(this.tagIndex.get(tag) ?? [])];
    keys.forEach((key) => this.delete(key));
    return keys.length;
  }

  delete(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.entries.delete(key);
    entry.tags.forEach((tag) => {
      const keys = this.tagIndex.get(tag);
      keys?.delete(key);
      if (!keys?.size) this.tagIndex.delete(tag);
    });
    return true;
  }

  clear(): void {
    this.entries.clear();
    this.pending.clear();
    this.tagIndex.clear();
  }

  private evictLeastRecentlyUsed(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) return;
      this.delete(oldestKey);
    }
  }
}

export const storefrontCache = new TaggedCache({
  defaultTtlMs: 20_000,
  maxEntries: 300,
});
