export type PublicationRecoveryPoint = {
  id: string;
  storeId: string;
  revision: number;
  createdAt: string;
  reason: "loaded-publication" | "pre-publish" | "manual";
  document: unknown;
};

export interface PublicationRecoveryStore {
  capture(input: Omit<PublicationRecoveryPoint, "id" | "createdAt">): PublicationRecoveryPoint;
  get(storeId: string, recoveryPointId: string): PublicationRecoveryPoint | null;
  list(storeId: string): PublicationRecoveryPoint[];
  clear(storeId: string): void;
}

const clonePoint = (point: PublicationRecoveryPoint): PublicationRecoveryPoint =>
  structuredClone(point);

const recoveryId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export class PublicationRecoverySystem implements PublicationRecoveryStore {
  private readonly points = new Map<string, PublicationRecoveryPoint[]>();

  constructor(private readonly maximumPointsPerStore = 20) {
    if (!Number.isInteger(maximumPointsPerStore) || maximumPointsPerStore < 1) {
      throw new Error("Publication recovery capacity must be a positive integer.");
    }
  }

  capture(input: Omit<PublicationRecoveryPoint, "id" | "createdAt">): PublicationRecoveryPoint {
    if (!input.storeId.trim()) throw new Error("Recovery points require a store id.");
    const point: PublicationRecoveryPoint = {
      ...structuredClone(input),
      id: recoveryId(),
      createdAt: new Date().toISOString(),
    };
    const existing = this.points.get(input.storeId) ?? [];
    const next = [point, ...existing].slice(0, this.maximumPointsPerStore);
    this.points.set(input.storeId, next);
    return clonePoint(point);
  }

  get(storeId: string, recoveryPointId: string): PublicationRecoveryPoint | null {
    const point = this.points.get(storeId)?.find((candidate) => candidate.id === recoveryPointId);
    return point ? clonePoint(point) : null;
  }

  list(storeId: string): PublicationRecoveryPoint[] {
    return (this.points.get(storeId) ?? []).map(clonePoint);
  }

  clear(storeId: string): void {
    this.points.delete(storeId);
  }
}

export const publicationRecoverySystem = new PublicationRecoverySystem();

