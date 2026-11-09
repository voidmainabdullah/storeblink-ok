import { validateSceneTreeStructure } from "@/engine/validation";
import type { ThemeManifest } from "@/theme-engine/contracts";
import { builtInThemeRegistry } from "@/themes/registry";
import type { SceneNode, SceneTree } from "@/types";
import type {
  AuditableThemePage,
  ThemePolicyContext,
  ThemePolicyIssue,
  ThemePolicyMetrics,
  ThemePolicyReport,
  ThemeProductionLimits,
} from "./types";

export const DEFAULT_THEME_PRODUCTION_LIMITS: ThemeProductionLimits = {
  maxDocumentBytes: 5 * 1024 * 1024,
  maxPages: 100,
  maxTotalNodes: 20_000,
  maxNodesPerPage: 5_000,
  maxDepth: 32,
  maxChildrenPerNode: 500,
  maxSectionsPerPage: 100,
  maxDynamicBindingsPerPage: 1_500,
  maxEffectsPerNode: 12,
  maxExtensionNodesPerPage: 100,
};

const EMPTY_METRICS: ThemePolicyMetrics = {
  documentBytes: 0,
  pages: 0,
  totalNodes: 0,
  maximumPageNodes: 0,
  maximumDepth: 0,
  dynamicBindings: 0,
  extensionNodes: 0,
};

const encodedBytes = (value: unknown): number => {
  const serialized = JSON.stringify(value);
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(serialized).byteLength;
  return serialized.length;
};

const issue = (
  code: string,
  severity: ThemePolicyIssue["severity"],
  message: string,
  pageId?: string,
  nodeId?: string,
): ThemePolicyIssue => ({ code, severity, message, pageId, nodeId });

const publishSeverity = (context: ThemePolicyContext): ThemePolicyIssue["severity"] =>
  context.mode === "publish" ? "error" : "warning";

const recordValue = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const nodeLabel = (node: SceneNode): string => node.name.trim() || node.id;

const isUnsafeDestination = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  const destination = value.trim();
  if (!destination) return false;
  return /^(?:javascript|data|vbscript):/i.test(destination);
};

const sectionType = (node: SceneNode): string | null => {
  const value =
    node.extensions?.canonicalSectionType ??
    node.extensions?.sectionType;
  return typeof value === "string" && value.trim() ? value : null;
};

const themeIdForScene = (scene: SceneTree): string | null => {
  const root = scene.rootNodeId ? scene.nodes[scene.rootNodeId] : undefined;
  const value = root?.extensions?.themeId ?? root?.extensions?.template;
  return typeof value === "string" && value.trim() ? value : null;
};

const pagesFromDocument = (document: unknown): AuditableThemePage[] => {
  if (!document || typeof document !== "object" || Array.isArray(document)) return [];
  const value = document as Record<string, unknown>;
  const pageDocument = recordValue(value.engine_page_document);
  if (Array.isArray(pageDocument?.pages)) {
    return pageDocument.pages.flatMap((entry, index) => {
      const page = recordValue(entry);
      const scene = page?.scene;
      if (!scene || typeof scene !== "object") return [];
      return [{
        id: typeof page.id === "string" ? page.id : `page-${index + 1}`,
        title: typeof page.title === "string" ? page.title : `Page ${index + 1}`,
        slug: typeof page.slug === "string" ? page.slug : `page-${index + 1}`,
        pageType: page.kind === "home" ? "home" : "page",
        scene: scene as SceneTree,
      }];
    });
  }
  const scene = value.engine_scene;
  return scene && typeof scene === "object"
    ? [{ id: "home", title: "Home", slug: "home", pageType: "home", scene: scene as SceneTree }]
    : [];
};

const manifestForScene = (scene: SceneTree): ThemeManifest | null => {
  const themeId = themeIdForScene(scene);
  return themeId ? builtInThemeRegistry.get(themeId) : null;
};

export class ThemePolicyViolationError extends Error {
  readonly report: ThemePolicyReport;

  constructor(report: ThemePolicyReport) {
    const first = report.issues.find((entry) => entry.severity === "error");
    super(first?.message ?? "Theme document failed production policy.");
    this.name = "ThemePolicyViolationError";
    this.report = structuredClone(report);
  }
}

export class ThemeProductionPolicy {
  readonly limits: ThemeProductionLimits;

  constructor(limits: Partial<ThemeProductionLimits> = {}) {
    this.limits = { ...DEFAULT_THEME_PRODUCTION_LIMITS, ...limits };
  }

  auditScene(
    scene: SceneTree,
    context: ThemePolicyContext,
    options: {
      pageId?: string;
      pageType?: string;
      manifest?: ThemeManifest | null;
    } = {},
  ): ThemePolicyReport {
    const pageId = options.pageId ?? "home";
    const issues: ThemePolicyIssue[] = [];
    const nodes = Object.values(scene.nodes ?? {});
    const productIds = context.productIds
      ? new Set([...context.productIds].map(String))
      : null;
    const structure = validateSceneTreeStructure(scene);
    structure.errors.forEach((message) => {
      issues.push(issue("scene.structure", "error", message, pageId));
    });
    if (nodes.length > this.limits.maxNodesPerPage) {
      issues.push(issue(
        "scene.nodes.limit",
        "error",
        `Page ${pageId} contains ${nodes.length} nodes; the platform limit is ${this.limits.maxNodesPerPage}.`,
        pageId,
      ));
    }

    let maximumDepth = 0;
    let dynamicBindings = 0;
    let extensionNodes = 0;
    let sections = 0;
    let h1Count = 0;
    const visited = new Set<string>();
    const stack = scene.rootNodeId ? [{ nodeId: scene.rootNodeId, depth: 1 }] : [];
    while (stack.length) {
      const current = stack.pop();
      if (!current || visited.has(current.nodeId)) continue;
      visited.add(current.nodeId);
      maximumDepth = Math.max(maximumDepth, current.depth);
      const node = scene.nodes[current.nodeId];
      if (!node) continue;
      node.childIds.forEach((childId) => stack.push({ nodeId: childId, depth: current.depth + 1 }));
    }
    if (maximumDepth > this.limits.maxDepth) {
      issues.push(issue(
        "scene.depth.limit",
        "error",
        `Page ${pageId} has nesting depth ${maximumDepth}; the platform limit is ${this.limits.maxDepth}.`,
        pageId,
      ));
    }

    nodes.forEach((node) => {
      if (node.childIds.length > this.limits.maxChildrenPerNode) {
        issues.push(issue(
          "scene.children.limit",
          "error",
          `${nodeLabel(node)} has ${node.childIds.length} direct children; the limit is ${this.limits.maxChildrenPerNode}.`,
          pageId,
          node.id,
        ));
      }
      if (node.style.effects.length > this.limits.maxEffectsPerNode) {
        issues.push(issue(
          "scene.effects.limit",
          "error",
          `${nodeLabel(node)} has ${node.style.effects.length} effects; the limit is ${this.limits.maxEffectsPerNode}.`,
          pageId,
          node.id,
        ));
      }
      if (
        node.extensions?.editorKind === "section" ||
        (node.parentId === scene.rootNodeId && Boolean(sectionType(node)))
      ) {
        sections += 1;
      }
      const binding = recordValue(node.extensions?.dynamicBinding);
      if (binding) {
        dynamicBindings += 1;
        const source = binding.source;
        const target = binding.target;
        if (source !== "product" && source !== "store") {
          issues.push(issue(
            "binding.source.invalid",
            "error",
            `${nodeLabel(node)} uses unsupported dynamic source ${String(source)}.`,
            pageId,
            node.id,
          ));
        }
        if (typeof target !== "string" || !target.trim()) {
          issues.push(issue(
            "binding.target.missing",
            "error",
            `${nodeLabel(node)} has a dynamic binding without a target.`,
            pageId,
            node.id,
          ));
        }
      }
      if (node.extensions?.extensionId || node.extensions?.extensionSlot) extensionNodes += 1;
      if (isUnsafeDestination(node.extensions?.navigationTarget)) {
        issues.push(issue(
          "navigation.protocol.unsafe",
          "error",
          `${nodeLabel(node)} uses an unsafe navigation protocol.`,
          pageId,
          node.id,
        ));
      }
      const productId =
        node.extensions?.productId ??
        binding?.productId;
      if (
        productIds &&
        (typeof productId === "string" || typeof productId === "number") &&
        !productIds.has(String(productId))
      ) {
        issues.push(issue(
          "reference.product.missing",
          publishSeverity(context),
          `${nodeLabel(node)} references a product that no longer exists.`,
          pageId,
          node.id,
        ));
      }
      if (node.type === "image" && node.props.src && !String(node.props.alt ?? "").trim()) {
        issues.push(issue(
          "accessibility.image.alt",
          publishSeverity(context),
          `${nodeLabel(node)} requires accessible alt text.`,
          pageId,
          node.id,
        ));
      }
      if (node.type === "button" && !String(node.props.label ?? node.props.text ?? "").trim()) {
        issues.push(issue(
          "accessibility.button.label",
          publishSeverity(context),
          `${nodeLabel(node)} requires an accessible button label.`,
          pageId,
          node.id,
        ));
      }
      if (
        node.extensions?.navigationTarget &&
        node.type !== "image" &&
        !String(node.props.label ?? node.props.text ?? node.props.ariaLabel ?? "").trim()
      ) {
        issues.push(issue(
          "accessibility.link.label",
          publishSeverity(context),
          `${nodeLabel(node)} has a destination but no accessible link text.`,
          pageId,
          node.id,
        ));
      }
      if (node.type === "text" && String(node.props.semanticTag ?? "").toLowerCase() === "h1") {
        h1Count += 1;
      }
    });

    if (sections > this.limits.maxSectionsPerPage) {
      issues.push(issue(
        "scene.sections.limit",
        "error",
        `Page ${pageId} contains ${sections} sections; the limit is ${this.limits.maxSectionsPerPage}.`,
        pageId,
      ));
    }
    if (dynamicBindings > this.limits.maxDynamicBindingsPerPage) {
      issues.push(issue(
        "binding.count.limit",
        "error",
        `Page ${pageId} contains ${dynamicBindings} dynamic bindings; the limit is ${this.limits.maxDynamicBindingsPerPage}.`,
        pageId,
      ));
    }
    if (extensionNodes > this.limits.maxExtensionNodesPerPage) {
      issues.push(issue(
        "extension.count.limit",
        "error",
        `Page ${pageId} contains ${extensionNodes} extension nodes; the limit is ${this.limits.maxExtensionNodesPerPage}.`,
        pageId,
      ));
    }
    if (h1Count > 1) {
      issues.push(issue(
        "accessibility.heading.multiple-h1",
        publishSeverity(context),
        `Page ${pageId} contains more than one H1 heading.`,
        pageId,
      ));
    }

    const manifest = options.manifest ?? manifestForScene(scene);
    const actualThemeId = themeIdForScene(scene);
    if (manifest && actualThemeId !== manifest.id) {
      issues.push(issue(
        "theme.identity.mismatch",
        "error",
        `Scene theme ${String(actualThemeId)} does not match package ${manifest.id}.`,
        pageId,
      ));
    }
    const template = manifest?.templates.find(
      (candidate) => candidate.pageType === (options.pageType ?? "home"),
    );
    if (template?.maximumSections && sections > template.maximumSections) {
      issues.push(issue(
        "theme.sections.limit",
        "error",
        `Page ${pageId} contains ${sections} sections; ${manifest?.name ?? "the theme"} allows ${template.maximumSections}.`,
        pageId,
      ));
    }
    if (template?.requiredSectionTypes?.length) {
      const available = new Set(
        nodes
          .filter((node) =>
            node.extensions?.editorKind === "section" ||
            node.parentId === scene.rootNodeId)
          .map(sectionType)
          .filter((value): value is string => Boolean(value)),
      );
      template.requiredSectionTypes.forEach((required) => {
        if (!available.has(required)) {
          issues.push(issue(
            "section.required.missing",
            publishSeverity(context),
            `Page ${pageId} is missing required section ${required}.`,
            pageId,
          ));
        }
      });
    }

    const metrics: ThemePolicyMetrics = {
      ...EMPTY_METRICS,
      documentBytes: encodedBytes(scene),
      pages: 1,
      totalNodes: nodes.length,
      maximumPageNodes: nodes.length,
      maximumDepth,
      dynamicBindings,
      extensionNodes,
    };
    return {
      valid: !issues.some((entry) => entry.severity === "error"),
      issues,
      metrics,
      limits: { ...this.limits },
    };
  }

  auditDocument(document: unknown, context: ThemePolicyContext): ThemePolicyReport {
    const pages = pagesFromDocument(document);
    const issues: ThemePolicyIssue[] = [];
    const metrics: ThemePolicyMetrics = {
      ...EMPTY_METRICS,
      documentBytes: encodedBytes(document),
      pages: pages.length,
    };
    if (!pages.length) {
      issues.push(issue(
        "document.scene.missing",
        "error",
        "The storefront document does not contain an Engine Scene.",
      ));
    }
    if (pages.length > this.limits.maxPages) {
      issues.push(issue(
        "document.pages.limit",
        "error",
        `The storefront contains ${pages.length} pages; the limit is ${this.limits.maxPages}.`,
      ));
    }
    if (metrics.documentBytes > this.limits.maxDocumentBytes) {
      issues.push(issue(
        "document.bytes.limit",
        "error",
        `The storefront document is ${metrics.documentBytes} bytes; the limit is ${this.limits.maxDocumentBytes}.`,
      ));
    }
    const slugs = new Set<string>();
    pages.forEach((page) => {
      if (slugs.has(page.slug)) {
        issues.push(issue(
          "document.page.slug.duplicate",
          "error",
          `Page slug ${page.slug} is duplicated.`,
          page.id,
        ));
      }
      slugs.add(page.slug);
      const report = this.auditScene(page.scene, context, {
        pageId: page.id,
        pageType: page.pageType,
      });
      issues.push(...report.issues);
      metrics.totalNodes += report.metrics.totalNodes;
      metrics.maximumPageNodes = Math.max(metrics.maximumPageNodes, report.metrics.maximumPageNodes);
      metrics.maximumDepth = Math.max(metrics.maximumDepth, report.metrics.maximumDepth);
      metrics.dynamicBindings += report.metrics.dynamicBindings;
      metrics.extensionNodes += report.metrics.extensionNodes;
    });
    if (metrics.totalNodes > this.limits.maxTotalNodes) {
      issues.push(issue(
        "document.nodes.limit",
        "error",
        `The storefront contains ${metrics.totalNodes} nodes; the limit is ${this.limits.maxTotalNodes}.`,
      ));
    }
    const unique = [...new Map(
      issues.map((entry) => [
        `${entry.code}:${entry.pageId ?? ""}:${entry.nodeId ?? ""}:${entry.message}`,
        entry,
      ]),
    ).values()];
    return {
      valid: !unique.some((entry) => entry.severity === "error"),
      issues: unique,
      metrics,
      limits: { ...this.limits },
    };
  }

  assertScene(
    scene: SceneTree,
    context: ThemePolicyContext,
    manifest?: ThemeManifest | null,
  ): ThemePolicyReport {
    const report = this.auditScene(scene, context, { manifest });
    if (!report.valid) throw new ThemePolicyViolationError(report);
    return report;
  }

  assertDocument(document: unknown, context: ThemePolicyContext): ThemePolicyReport {
    const report = this.auditDocument(document, context);
    if (!report.valid) throw new ThemePolicyViolationError(report);
    return report;
  }
}

export const themeProductionPolicy = new ThemeProductionPolicy();
