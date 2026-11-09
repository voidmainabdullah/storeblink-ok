import type { SceneNode, SceneTree } from "@/types";
import type {
  DependencyEdge,
  DependencyGraphAPI,
  DependencyImpact,
  DependencyRef,
} from "./types";

const refKey = (ref: DependencyRef): string => `${ref.kind}:${ref.id}`;
const edgeKey = (edge: DependencyEdge): string =>
  `${refKey(edge.source)}>${edge.relation}>${refKey(edge.target)}`;

const stringValue = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

const collectAssetIds = (node: SceneNode): Set<string> => {
  const ids = new Set<string>();
  const direct = [node.props.assetId, node.extensions?.assetId, node.extensions?.logoAssetId];
  direct.forEach((value) => {
    const id = stringValue(value);
    if (id) ids.add(id);
  });
  node.style.fills.forEach((fill) => {
    if (fill.type === "image") {
      const id = stringValue(fill.assetId);
      if (id) ids.add(id);
    }
  });
  return ids;
};

const bindingRecord = (node: SceneNode): Record<string, unknown> | null => {
  const binding = node.extensions?.dynamicBinding;
  return binding && typeof binding === "object" && !Array.isArray(binding)
    ? binding as Record<string, unknown>
    : null;
};

const sceneEdgesForNode = (node: SceneNode): DependencyEdge[] => {
  const source: DependencyRef = { kind: "node", id: node.id };
  const edges: DependencyEdge[] = [...collectAssetIds(node)].map((id) => ({
    source,
    target: { kind: "asset", id },
    relation: "uses-asset",
  }));
  const binding = bindingRecord(node);
  const productId = stringValue(node.extensions?.productId ?? binding?.productId);
  const collectionId = stringValue(node.extensions?.collectionId ?? binding?.collectionId);
  if (productId) edges.push({ source, target: { kind: "product", id: productId }, relation: "binds-product" });
  if (collectionId) edges.push({ source, target: { kind: "collection", id: collectionId }, relation: "binds-collection" });
  if (node.meta.componentId) {
    edges.push({
      source: { kind: "component-instance", id: node.id },
      target: { kind: "component-definition", id: node.meta.componentId },
      relation: "instantiates-component",
    });
  }
  return edges;
};

const navigationPageEdges = (root: SceneNode): DependencyEdge[] => {
  const navigation = root.extensions?.navigation;
  if (!navigation || typeof navigation !== "object" || Array.isArray(navigation)) {
    return [];
  }
  const items = (navigation as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const source: DependencyRef = {
    kind: "navigation",
    id: `${root.id}:primary`,
  };
  return items.flatMap((item): DependencyEdge[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const target = record.target;
    if (!target || typeof target !== "object" || Array.isArray(target)) return [];
    const targetRecord = target as Record<string, unknown>;
    const pageId = stringValue(targetRecord.entityId);
    if (targetRecord.type !== "page" || !pageId) return [];
    return [{
      source,
      target: { kind: "page", id: pageId },
      relation: "links-page",
      metadata: {
        navigationItemId: stringValue(record.id),
      },
    }];
  });
};

export class DependencyGraph implements DependencyGraphAPI {
  private readonly edges = new Map<string, DependencyEdge>();
  private readonly outgoing = new Map<string, Set<string>>();
  private readonly incoming = new Map<string, Set<string>>();

  link(edge: DependencyEdge): void {
    if (!edge.source.id || !edge.target.id) throw new Error("Dependency references require non-empty IDs.");
    const key = edgeKey(edge);
    if (this.edges.has(key)) return;
    const frozen = Object.freeze({ ...edge, source: Object.freeze({ ...edge.source }), target: Object.freeze({ ...edge.target }) });
    this.edges.set(key, frozen);
    this.addIndex(this.outgoing, refKey(edge.source), key);
    this.addIndex(this.incoming, refKey(edge.target), key);
  }

  unlink(edge: DependencyEdge): void {
    const key = edgeKey(edge);
    const stored = this.edges.get(key);
    if (!stored) return;
    this.edges.delete(key);
    this.removeIndex(this.outgoing, refKey(stored.source), key);
    this.removeIndex(this.incoming, refKey(stored.target), key);
  }

  replaceSource(source: DependencyRef, edges: readonly DependencyEdge[]): void {
    this.getDependencies(source).forEach((edge) => this.unlink(edge));
    edges.forEach((edge) => {
      if (refKey(edge.source) !== refKey(source)) throw new Error("Replacement edge source does not match the requested entity.");
      this.link(edge);
    });
  }

  removeEntity(entity: DependencyRef): void {
    [...this.getDependencies(entity), ...this.getDependents(entity)].forEach((edge) => this.unlink(edge));
  }

  getDependencies(source: DependencyRef): readonly DependencyEdge[] {
    return this.lookup(this.outgoing, source);
  }

  getDependents(target: DependencyRef): readonly DependencyEdge[] {
    return this.lookup(this.incoming, target);
  }

  getImpact(root: DependencyRef): DependencyImpact {
    const directDependents = this.getDependents(root);
    const visited = new Set<string>([refKey(root)]);
    const queue = directDependents.map((edge) => edge.source);
    const transitiveDependents: DependencyRef[] = [];
    while (queue.length) {
      const current = queue.shift() as DependencyRef;
      const key = refKey(current);
      if (visited.has(key)) continue;
      visited.add(key);
      transitiveDependents.push(current);
      this.getDependents(current).forEach((edge) => queue.push(edge.source));
    }
    return { root: { ...root }, directDependents, transitiveDependents };
  }

  rebuildScene(scene: SceneTree): void {
    [...this.edges.values()]
      .filter((edge) =>
        edge.source.kind === "node" ||
        edge.source.kind === "component-instance" ||
        edge.source.kind === "navigation" ||
        edge.source.kind === "template",
      )
      .forEach((edge) => this.unlink(edge));
    Object.values(scene.nodes).forEach((node) => sceneEdgesForNode(node).forEach((edge) => this.link(edge)));
    const root = scene.rootNodeId ? scene.nodes[scene.rootNodeId] : undefined;
    if (!root) return;
    navigationPageEdges(root).forEach((edge) => this.link(edge));
    const templateId = stringValue(
      root.extensions?.themeId ?? root.extensions?.template,
    );
    if (root && templateId) {
      this.link({
        source: { kind: "node", id: root.id },
        target: { kind: "template", id: templateId },
        relation: "uses-template",
      });
      if (root.extensions?.themeChrome) {
        this.link({
          source: { kind: "template", id: templateId },
          target: { kind: "shared-chrome", id: `${root.id}:theme-chrome` },
          relation: "uses-shared-chrome",
        });
      }
    }
  }

  clear(): void {
    this.edges.clear();
    this.outgoing.clear();
    this.incoming.clear();
  }

  private lookup(index: Map<string, Set<string>>, ref: DependencyRef): DependencyEdge[] {
    return [...(index.get(refKey(ref)) ?? [])]
      .map((key) => this.edges.get(key))
      .filter((edge): edge is DependencyEdge => Boolean(edge));
  }

  private addIndex(index: Map<string, Set<string>>, ref: string, edge: string): void {
    const entries = index.get(ref) ?? new Set<string>();
    entries.add(edge);
    index.set(ref, entries);
  }

  private removeIndex(index: Map<string, Set<string>>, ref: string, edge: string): void {
    const entries = index.get(ref);
    if (!entries) return;
    entries.delete(edge);
    if (!entries.size) index.delete(ref);
  }
}

export const createDependencyGraph = () => new DependencyGraph();
