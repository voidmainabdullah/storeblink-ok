import type { NodeId, Point, Rect } from "@/types";
import { rectsIntersect } from "@/rendering/geometry";
import type { HitTestIndexEntry } from "./types";

export class SpatialBucketIndex {
  private readonly buckets = new Map<string, Set<NodeId>>();
  private readonly entries = new Map<NodeId, HitTestIndexEntry>();

  constructor(private readonly bucketSize = 256) {}

  clear(): void {
    this.buckets.clear();
    this.entries.clear();
  }

  add(entry: HitTestIndexEntry): void {
    this.entries.set(entry.nodeId, entry);
    for (const key of this.getKeysForRect(entry.aabb)) {
      const bucket = this.buckets.get(key) ?? new Set<NodeId>();
      bucket.add(entry.nodeId);
      this.buckets.set(key, bucket);
    }
  }

  queryPoint(point: Point): HitTestIndexEntry[] {
    const ids = this.buckets.get(this.getKey(point.x, point.y));
    if (!ids) return [];
    return [...ids].map((id) => this.entries.get(id)).filter(Boolean) as HitTestIndexEntry[];
  }

  queryRect(rect: Rect): HitTestIndexEntry[] {
    const ids = new Set<NodeId>();
    for (const key of this.getKeysForRect(rect)) {
      const bucket = this.buckets.get(key);
      if (!bucket) continue;
      bucket.forEach((id) => ids.add(id));
    }

    return [...ids]
      .map((id) => this.entries.get(id))
      .filter((entry): entry is HitTestIndexEntry => Boolean(entry) && rectsIntersect(entry.aabb, rect));
  }

  getEntryCount(): number {
    return this.entries.size;
  }

  private getKeysForRect(rect: Rect): string[] {
    const minBucketX = Math.floor(rect.x / this.bucketSize);
    const minBucketY = Math.floor(rect.y / this.bucketSize);
    const maxBucketX = Math.floor((rect.x + rect.width) / this.bucketSize);
    const maxBucketY = Math.floor((rect.y + rect.height) / this.bucketSize);
    const keys: string[] = [];

    for (let bucketX = minBucketX; bucketX <= maxBucketX; bucketX += 1) {
      for (let bucketY = minBucketY; bucketY <= maxBucketY; bucketY += 1) {
        keys.push(`${bucketX}:${bucketY}`);
      }
    }

    return keys;
  }

  private getKey(x: number, y: number): string {
    return `${Math.floor(x / this.bucketSize)}:${Math.floor(y / this.bucketSize)}`;
  }
}
