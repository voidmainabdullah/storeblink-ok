type CacheEntry<T> = { value: T; expiresAt: number };

export class AssetCache<T = string> {
  private readonly values = new Map<string, CacheEntry<T>>();

  get(key: string, now = Date.now()): T | null {
    const entry = this.values.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.values.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T, expiresAt: number): void {
    this.values.set(key, { value, expiresAt });
  }

  deletePrefix(prefix: string): void {
    [...this.values.keys()].filter((key) => key.startsWith(prefix)).forEach((key) => this.values.delete(key));
  }

  clear(): void {
    this.values.clear();
  }
}
