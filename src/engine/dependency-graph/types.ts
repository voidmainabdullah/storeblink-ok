import type { SceneTree } from "@/types";

export type DependencyEntityKind =
  | "node"
  | "asset"
  | "product"
  | "collection"
  | "navigation"
  | "page"
  | "component-instance"
  | "component-definition"
  | "template"
  | "shared-chrome"
  | "published-revision"
  | "asset-manifest";

export type DependencyRelation =
  | "uses-asset"
  | "binds-product"
  | "binds-collection"
  | "links-page"
  | "instantiates-component"
  | "uses-template"
  | "uses-shared-chrome"
  | "publishes-assets"
  | `custom:${string}`;

export type DependencyRef = Readonly<{
  kind: DependencyEntityKind;
  id: string;
}>;

export type DependencyEdge = Readonly<{
  source: DependencyRef;
  target: DependencyRef;
  relation: DependencyRelation;
  metadata?: Readonly<Record<string, unknown>>;
}>;

export type DependencyImpact = Readonly<{
  root: DependencyRef;
  directDependents: readonly DependencyEdge[];
  transitiveDependents: readonly DependencyRef[];
}>;

export interface DependencyGraphAPI {
  link(edge: DependencyEdge): void;
  unlink(edge: DependencyEdge): void;
  replaceSource(source: DependencyRef, edges: readonly DependencyEdge[]): void;
  removeEntity(entity: DependencyRef): void;
  getDependencies(source: DependencyRef): readonly DependencyEdge[];
  getDependents(target: DependencyRef): readonly DependencyEdge[];
  getImpact(target: DependencyRef): DependencyImpact;
  rebuildScene(scene: SceneTree): void;
  clear(): void;
}
