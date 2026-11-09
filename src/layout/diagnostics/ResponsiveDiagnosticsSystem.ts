import { cloneSceneTree } from "@/engine/scene-graph";
import { validateSceneTree } from "@/engine/validation";
import { LayoutEngine, layoutEngine } from "@/layout/engine";
import {
  IntrinsicMeasurementSystem,
  intrinsicMeasurementSystem,
} from "@/layout/measurement";
import {
  ResponsiveSystem,
  responsiveSystem,
} from "@/layout/responsive";
import {
  ResponsiveRuleRegistry,
  responsiveRuleRegistry,
} from "@/layout/rules";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { NodeId, SceneNode, SceneTree } from "@/types";
import { getInteractionTargetSize } from "@/rendering/renderer/interactionTarget";
import type {
  ResponsiveDiagnostic,
  ResponsiveDiagnosticCode,
  ResponsiveDiagnosticFix,
  ResponsiveDiagnosticReport,
  ResponsiveDiagnosticsSystemAPI,
} from "./types";

const EPSILON = 0.5;
const isRequiredControl = (
  node: SceneNode,
  breakpoint: ResponsiveBreakpoint,
): boolean => {
  const requiredAtBreakpoints = node.extensions?.requiredAtBreakpoints;
  if (Array.isArray(requiredAtBreakpoints)) {
    return requiredAtBreakpoints.includes(breakpoint);
  }
  const action = String(node.extensions?.action ?? "");
  if (action === "toggle-mobile-menu") return breakpoint !== "desktop";
  return action === "open-cart" || action === "add-to-cart";
};

const commonActions = (fix?: ResponsiveDiagnosticFix) => [
  ...(fix ? [{ kind: "auto-fix" as const, label: "Fix automatically" }] : []),
  { kind: "review" as const, label: "Review suggested fix" },
  { kind: "edit-breakpoint" as const, label: "Edit breakpoint" },
  { kind: "ignore" as const, label: "Ignore advisory" },
];

const diagnosticId = (
  code: ResponsiveDiagnosticCode,
  breakpoint: ResponsiveBreakpoint,
  nodeId: NodeId,
) => `${breakpoint}:${code}:${nodeId}`;

const issue = ({
  code,
  breakpoint,
  node,
  message,
  fix,
}: {
  code: ResponsiveDiagnosticCode;
  breakpoint: ResponsiveBreakpoint;
  node: SceneNode;
  message: string;
  fix?: ResponsiveDiagnosticFix;
}): ResponsiveDiagnostic => ({
  id: diagnosticId(code, breakpoint, node.id),
  code,
  severity: "advisory",
  breakpoint,
  nodeId: node.id,
  parentId: node.parentId,
  message,
  actions: commonActions(fix),
  ...(fix ? { fix } : {}),
});

const overlaps = (left: SceneNode, right: SceneNode): boolean =>
  left.transform.x < right.transform.x + right.transform.width - EPSILON &&
  left.transform.x + left.transform.width > right.transform.x + EPSILON &&
  left.transform.y < right.transform.y + right.transform.height - EPSILON &&
  left.transform.y + left.transform.height > right.transform.y + EPSILON;

const isDecorative = (node: SceneNode): boolean =>
  node.extensions?.allowOverflow === true ||
  node.extensions?.editorKind === "internal" ||
  ["decoration", "decorative-shape", "overlay"].includes(String(node.extensions?.blockType ?? ""));

const mergeLayout = (node: SceneNode, patch: Partial<SceneNode["layout"]>): SceneNode["layout"] => ({
  ...node.layout,
  ...patch,
  ...(patch.sizing ? { sizing: { ...(node.layout.sizing ?? {}), ...patch.sizing } } : {}),
  ...(patch.constraints ? { constraints: { ...(node.layout.constraints ?? {}), ...patch.constraints } } : {}),
  ...(patch.autoLayout ? { autoLayout: { ...(node.layout.autoLayout ?? {}), ...patch.autoLayout } } : {}),
  ...(patch.responsiveIntent
    ? { responsiveIntent: { ...(node.layout.responsiveIntent ?? {}), ...patch.responsiveIntent } }
    : {}),
});

export class ResponsiveDiagnosticsSystem implements ResponsiveDiagnosticsSystemAPI {
  constructor(
    private readonly responsive: ResponsiveSystem = responsiveSystem,
    private readonly layout: LayoutEngine = layoutEngine,
    private readonly measurement: IntrinsicMeasurementSystem = intrinsicMeasurementSystem,
    private readonly rules: ResponsiveRuleRegistry = responsiveRuleRegistry,
  ) {}

  analyze(
    scene: SceneTree,
    options: { breakpoint: ResponsiveBreakpoint; viewportWidth?: number },
  ): ResponsiveDiagnosticReport {
    const viewportWidth = options.viewportWidth ?? this.responsive.getSceneWidth(scene, options.breakpoint);
    const computed = this.layout.resolveSceneForViewport(scene, viewportWidth);
    const resolved = computed.scene;
    const issues: ResponsiveDiagnostic[] = [];

    Object.values(resolved.nodes).forEach((node) => {
      const parent = node.parentId ? resolved.nodes[node.parentId] : undefined;
      const sourceNode = scene.nodes[node.id];
      const rule = this.rules.resolve(node);
      if (!sourceNode) return;

      if (node.meta.hidden && isRequiredControl(node, options.breakpoint)) {
        const fix = { targetNodeId: node.id, meta: { hidden: false } } satisfies ResponsiveDiagnosticFix;
        issues.push(issue({
          code: "invisible-critical-control",
          breakpoint: options.breakpoint,
          node,
          message: `${node.name} is hidden at ${options.breakpoint}.`,
          fix,
        }));
      }
      if (node.meta.hidden || !parent) return;

      const overflowsHorizontally =
        node.transform.x < -EPSILON ||
        node.transform.x + node.transform.width > parent.transform.width + EPSILON;
      if (overflowsHorizontally && !isDecorative(node)) {
        const width = Math.min(node.transform.width, parent.transform.width);
        const x = Math.min(Math.max(0, node.transform.x), Math.max(0, parent.transform.width - width));
        const fix = { targetNodeId: node.id, transform: { x, width } } satisfies ResponsiveDiagnosticFix;
        issues.push(issue({
          code: "horizontal-overflow",
          breakpoint: options.breakpoint,
          node,
          message: `${node.name} extends beyond its parent width.`,
          fix,
        }));
      }

      const parentOverflow = String(parent.props.overflow ?? "visible");
      const clipped =
        ["hidden", "clip"].includes(parentOverflow) &&
        (node.transform.x < -EPSILON ||
          node.transform.y < -EPSILON ||
          node.transform.x + node.transform.width > parent.transform.width + EPSILON ||
          node.transform.y + node.transform.height > parent.transform.height + EPSILON);
      if (clipped && !isDecorative(node)) {
        const fix = {
          targetNodeId: parent.id,
          transform: {
            width: Math.max(parent.transform.width, node.transform.x + node.transform.width),
            height: Math.max(parent.transform.height, node.transform.y + node.transform.height),
          },
        } satisfies ResponsiveDiagnosticFix;
        issues.push(issue({
          code: "clipped-content",
          breakpoint: options.breakpoint,
          node,
          message: `${node.name} is clipped by ${parent.name}.`,
          fix,
        }));
      }

      if (node.type === "text") {
        const fontSize = Number(node.props.fontSize ?? 16);
        const minimum = node.layout.responsiveIntent?.minimumReadableSize ?? rule.minimumFontSize ?? 12;
        const maximum = rule.maximumFontSize ?? Math.max(72, parent.transform.width * 0.25);
        if (fontSize < minimum) {
          issues.push(issue({
            code: "unreadable-typography",
            breakpoint: options.breakpoint,
            node,
            message: `${node.name} is ${fontSize}px; the safe minimum is ${minimum}px.`,
            fix: { targetNodeId: node.id, props: { fontSize: minimum } },
          }));
        }
        if (fontSize > maximum) {
          issues.push(issue({
            code: "oversized-typography",
            breakpoint: options.breakpoint,
            node,
            message: `${node.name} is larger than the safe ${maximum}px limit.`,
            fix: { targetNodeId: node.id, props: { fontSize: maximum } },
          }));
        }
        const measured = this.measurement.measure(node, {
          scene: resolved,
          availableWidth: node.transform.width,
        });
        if (measured.height > node.transform.height + EPSILON) {
          issues.push(issue({
            code: "fixed-height-content-loss",
            breakpoint: options.breakpoint,
            node,
            message: `${node.name} needs ${Math.ceil(measured.height)}px height to show all text.`,
            fix: { targetNodeId: node.id, transform: { height: measured.height } },
          }));
        }
      }

      const rendererTarget = getInteractionTargetSize(node) ?? 0;
      const effectiveTargetWidth = Math.max(node.transform.width, rendererTarget);
      const effectiveTargetHeight = Math.max(node.transform.height, rendererTarget);
      if (
        rule.minimumTouchTarget &&
        (effectiveTargetWidth < rule.minimumTouchTarget || effectiveTargetHeight < rule.minimumTouchTarget)
      ) {
        issues.push(issue({
          code: "invalid-touch-target",
          breakpoint: options.breakpoint,
          node,
          message: `${node.name} is below the ${rule.minimumTouchTarget}px touch target.`,
          fix: {
            targetNodeId: node.id,
            transform: {
              width: Math.max(rule.minimumTouchTarget, node.transform.width),
              height: Math.max(rule.minimumTouchTarget, node.transform.height),
            },
          },
        }));
      }

      if (parent.layout.mode === "grid" && node.transform.width < rule.safeMinWidth - EPSILON) {
        issues.push(issue({
          code: "grid-card-under-minimum",
          breakpoint: options.breakpoint,
          node,
          message: `${node.name} is narrower than its ${rule.safeMinWidth}px safe minimum.`,
          fix: {
            targetNodeId: parent.id,
            layout: { autoLayout: { columns: "auto", minColumnWidth: rule.safeMinWidth } },
          },
        }));
      }
    });

    Object.values(resolved.nodes)
      .filter((node) => {
        const sectionType = node.extensions?.canonicalSectionType ?? node.extensions?.sectionType;
        return node.type === "section" && (sectionType === "site-header" || sectionType === "header");
      })
      .forEach((header) => {
        const controls = header.childIds
          .map((id) => resolved.nodes[id])
          .filter((node): node is SceneNode => Boolean(
            node &&
            node.parentId === header.id &&
            !node.meta.hidden &&
            !isDecorative(node) &&
            (node.extensions?.action || node.extensions?.blockType === "navigation-link" || node.extensions?.themeChromeSlot === "logo"),
          ));
        for (let leftIndex = 0; leftIndex < controls.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < controls.length; rightIndex += 1) {
            if (!overlaps(controls[leftIndex], controls[rightIndex])) continue;
            const node = controls[rightIndex];
            const id = diagnosticId("header-collision", options.breakpoint, node.id);
            if (issues.some((candidate) => candidate.id === id)) continue;
            issues.push(issue({
              code: "header-collision",
              breakpoint: options.breakpoint,
              node,
              message: `${node.name} overlaps ${controls[leftIndex].name} in the header.`,
            }));
          }
        }
      });

    return {
      breakpoint: options.breakpoint,
      viewportWidth,
      resolvedScene: resolved,
      issues,
    };
  }

  applyFix(scene: SceneTree, diagnostic: ResponsiveDiagnostic): SceneTree {
    if (!diagnostic.fix) return cloneSceneTree(scene);
    const next = cloneSceneTree(scene);
    const node = next.nodes[diagnostic.fix.targetNodeId];
    if (!node) throw new Error(`Diagnostic target ${diagnostic.fix.targetNodeId} no longer exists.`);
    const resolved = this.responsive.resolveNode(node, diagnostic.breakpoint);
    const transform = diagnostic.fix.transform
      ? { ...resolved.transform, ...diagnostic.fix.transform }
      : undefined;
    const props = diagnostic.fix.props
      ? { ...resolved.props, ...diagnostic.fix.props }
      : undefined;
    const meta = diagnostic.fix.meta
      ? { ...resolved.meta, ...diagnostic.fix.meta }
      : undefined;
    const layout = diagnostic.fix.layout
      ? mergeLayout(node, diagnostic.fix.layout)
      : node.layout;
    const responsiveLayout = this.responsive.updateLayout({ ...node, layout }, diagnostic.breakpoint, {
      ...(transform ? { transform } : {}),
      ...(props ? { props } : {}),
      ...(meta ? { meta } : {}),
    });
    next.nodes[node.id] = {
      ...node,
      ...(diagnostic.breakpoint === "desktop" && transform ? { transform } : {}),
      ...(diagnostic.breakpoint === "desktop" && props ? { props } : {}),
      ...(diagnostic.breakpoint === "desktop" && meta ? { meta } : {}),
      layout: responsiveLayout,
    };
    return this.layout.hasGenericLayout(next)
      ? this.layout.reflowScene(next)
      : validateSceneTree(next);
  }
}

export const createResponsiveDiagnosticsSystem = (options: {
  responsive?: ResponsiveSystem;
  layout?: LayoutEngine;
  measurement?: IntrinsicMeasurementSystem;
  rules?: ResponsiveRuleRegistry;
} = {}) => new ResponsiveDiagnosticsSystem(
  options.responsive,
  options.layout,
  options.measurement,
  options.rules,
);

export const responsiveDiagnosticsSystem = createResponsiveDiagnosticsSystem();
