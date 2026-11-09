import type { SceneTree } from "@/types";

export type ThemePolicyMode = "draft" | "publish";
export type ThemePolicySeverity = "error" | "warning";

export type ThemeProductionLimits = {
  maxDocumentBytes: number;
  maxPages: number;
  maxTotalNodes: number;
  maxNodesPerPage: number;
  maxDepth: number;
  maxChildrenPerNode: number;
  maxSectionsPerPage: number;
  maxDynamicBindingsPerPage: number;
  maxEffectsPerNode: number;
  maxExtensionNodesPerPage: number;
};

export type ThemePolicyIssue = {
  code: string;
  severity: ThemePolicySeverity;
  message: string;
  pageId?: string;
  nodeId?: string;
};

export type ThemePolicyMetrics = {
  documentBytes: number;
  pages: number;
  totalNodes: number;
  maximumPageNodes: number;
  maximumDepth: number;
  dynamicBindings: number;
  extensionNodes: number;
};

export type ThemePolicyReport = {
  valid: boolean;
  issues: ThemePolicyIssue[];
  metrics: ThemePolicyMetrics;
  limits: ThemeProductionLimits;
};

export type ThemePolicyContext = {
  mode: ThemePolicyMode;
  productIds?: Iterable<string | number>;
};

export type AuditableThemePage = {
  id: string;
  title: string;
  slug: string;
  pageType: string;
  scene: SceneTree;
};
