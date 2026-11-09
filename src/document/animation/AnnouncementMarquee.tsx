import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
} from "react";
import {
  legacyNavigationTarget,
  resolveMenuTarget,
} from "@/content/menus";
import { responsiveSystem } from "@/layout/responsive";
import { useSceneRenderContext } from "@/rendering/renderer";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { SceneNode } from "@/types";
import { animationSystem } from "./AnimationSystem";

type ResponsiveSetting<T> =
  | T
  | {
      base: T;
      desktop?: T;
      tablet?: T;
      mobile?: T;
    };

type MarqueeMessage = {
  id: string;
  text: string;
  color?: string;
  href: string | null;
  target?: "_blank";
  rel?: "noopener noreferrer";
};

const responsiveValue = <T,>(
  value: ResponsiveSetting<T> | undefined,
  breakpoint: ResponsiveBreakpoint,
  fallback: T,
): T => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("base" in value)
  ) {
    return (value as T | undefined) ?? fallback;
  }
  if (breakpoint === "mobile") {
    return value.mobile ?? value.tablet ?? value.desktop ?? value.base;
  }
  if (breakpoint === "tablet") {
    return value.tablet ?? value.desktop ?? value.base;
  }
  return value.desktop ?? value.base;
};

const finiteNumber = (
  value: ResponsiveSetting<number> | undefined,
  breakpoint: ResponsiveBreakpoint,
  fallback: number,
  min: number,
  max: number,
): number => {
  const parsed = Number(responsiveValue(value, breakpoint, fallback));
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, parsed))
    : fallback;
};

const safeLiteralHref = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (!href) return null;
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  if (href.startsWith("/") || href.startsWith("#")) return href;
  return null;
};

const messageForNode = (
  node: SceneNode,
  linkContext: ReturnType<typeof useSceneRenderContext>["linkContext"],
): MarqueeMessage => {
  const target = legacyNavigationTarget(node.extensions?.navigationTarget);
  const resolved =
    target && linkContext
      ? resolveMenuTarget(target, linkContext)
      : null;
  const href =
    resolved && !resolved.hidden
      ? resolved.href
      : safeLiteralHref(node.props.link ?? node.props.href);
  return {
    id: node.id,
    text: String(node.props.text ?? node.props.label ?? node.name),
    color:
      typeof node.props.color === "string"
        ? node.props.color
        : undefined,
    href,
    target:
      node.extensions?.openInNewTab === true || resolved?.target === "_blank"
        ? "_blank"
        : undefined,
    rel:
      node.extensions?.openInNewTab === true ||
      resolved?.rel === "noopener noreferrer"
        ? "noopener noreferrer"
        : undefined,
  };
};

const MessageGroup = ({
  messages,
  separator,
  gap,
  duplicate = false,
}: {
  messages: MarqueeMessage[];
  separator: string;
  gap: number;
  duplicate?: boolean;
}) => (
  <div
    data-announcement-marquee-group
    aria-hidden={duplicate || undefined}
    role={duplicate ? undefined : "list"}
    style={{
      display: "flex",
      flex: "none",
      alignItems: "center",
      gap,
      paddingRight: gap,
      whiteSpace: "nowrap",
    }}
  >
    {messages.map((message, index) => {
      const content = message.href ? (
        <a
          href={message.href}
          target={message.target}
          rel={message.rel}
          data-node-id={duplicate ? undefined : message.id}
          tabIndex={duplicate ? -1 : undefined}
          style={{
            color: message.color ?? "inherit",
            textDecoration: "none",
          }}
        >
          {message.text}
        </a>
      ) : (
        <span
          data-node-id={duplicate ? undefined : message.id}
          style={{ color: message.color ?? "inherit" }}
        >
          {message.text}
        </span>
      );
      return (
        <span
          key={`${duplicate ? "duplicate" : "semantic"}-${message.id}`}
          role={duplicate ? undefined : "listitem"}
          style={{ display: "inline-flex", alignItems: "center", gap }}
        >
          {index > 0 && separator ? (
            <span aria-hidden="true">{separator}</span>
          ) : null}
          {content}
        </span>
      );
    })}
  </div>
);

export const AnnouncementMarquee = ({
  node,
  mode,
  children,
}: {
  node: SceneNode;
  mode: "editor" | "storefront";
  children: ReactNode;
}) => {
  const renderContext = useSceneRenderContext();
  const viewportRef = useRef<HTMLDivElement>(null);
  const semanticGroupRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(20);
  const [cycleWidth, setCycleWidth] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(1);
  const [inViewport, setInViewport] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    animationSystem.prefersReducedMotion,
  );
  const breakpoint =
    renderContext.breakpoint ??
    responsiveSystem.getActiveBreakpoint();
  const resolvedNode = responsiveSystem.resolveNode(node, breakpoint);
  const enabled = responsiveValue(
    resolvedNode.props.enabled as ResponsiveSetting<boolean> | undefined,
    breakpoint,
    true,
  );
  const speed = finiteNumber(
    resolvedNode.props.speed as ResponsiveSetting<number> | undefined,
    breakpoint,
    48,
    8,
    240,
  );
  const gap = finiteNumber(
    resolvedNode.props.itemGap as ResponsiveSetting<number> | undefined,
    breakpoint,
    48,
    0,
    240,
  );
  const horizontalPadding = finiteNumber(
    resolvedNode.props.horizontalPadding as ResponsiveSetting<number> | undefined,
    breakpoint,
    20,
    0,
    160,
  );
  const fontSize = finiteNumber(
    resolvedNode.props.fontSize as ResponsiveSetting<number> | undefined,
    breakpoint,
    13,
    8,
    72,
  );
  const letterSpacing = finiteNumber(
    resolvedNode.props.letterSpacing as ResponsiveSetting<number> | undefined,
    breakpoint,
    0,
    0,
    16,
  );
  const fontWeight = finiteNumber(
    resolvedNode.props.fontWeight as ResponsiveSetting<number> | undefined,
    breakpoint,
    600,
    100,
    900,
  );
  const direction = resolvedNode.props.direction === "right" ? "right" : "left";
  const pauseOnHover = resolvedNode.props.pauseOnHover !== false;
  const pauseWhenOffscreen = resolvedNode.props.pauseWhenOffscreen !== false;
  const separator = String(resolvedNode.props.separator ?? "\u2022");
  const messages = useMemo(
    () =>
      node.childIds
        .map((id) => renderContext.scene?.nodes[id])
        .filter((child): child is SceneNode => Boolean(child))
        .map((child) => responsiveSystem.resolveNode(child, breakpoint))
        .filter(
          (child) =>
            !child.meta.hidden &&
            child.extensions?.blockType === "announcement-item",
        )
        .map((child) => messageForNode(child, renderContext.linkContext)),
    [
      breakpoint,
      node.childIds,
      renderContext.linkContext,
      renderContext.scene,
    ],
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const element = viewportRef.current;
    if (
      !element ||
      !pauseWhenOffscreen ||
      typeof IntersectionObserver === "undefined"
    ) {
      setInViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInViewport(entry?.isIntersecting ?? true),
      { threshold: 0.01 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [pauseWhenOffscreen]);

  useLayoutEffect(() => {
    const group = semanticGroupRef.current;
    const viewport = viewportRef.current;
    if (!group || !viewport) return;
    let frameId = 0;
    const measure = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const width = Math.max(1, group.getBoundingClientRect().width);
        const viewportWidth = Math.max(
          1,
          viewport.getBoundingClientRect().width,
        );
        const copies = Math.max(1, Math.ceil(viewportWidth / width) + 1);
        setCycleWidth((current) => current === width ? current : width);
        setDuplicateCount((current) =>
          current === copies ? current : copies,
        );
        setDuration(animationSystem.durationForDistance(width, speed));
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => {
        window.cancelAnimationFrame(frameId);
        window.removeEventListener("resize", measure);
      };
    }
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    observer.observe(viewport);
    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [gap, messages, speed]);

  if (mode === "editor") return children;
  if (!enabled || !messages.length) return null;

  const paused =
    reducedMotion ||
    focusWithin ||
    (pauseOnHover && hovered) ||
    (pauseWhenOffscreen && !inViewport);
  const typography: CSSProperties = {
    color: String(resolvedNode.props.textColor ?? "inherit"),
    fontFamily: String(resolvedNode.props.fontFamily ?? "inherit"),
    fontSize,
    fontWeight,
    letterSpacing,
    lineHeight: 1.2,
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setFocusWithin(false);
    }
  };

  return (
    <div
      ref={viewportRef}
      data-announcement-marquee
      data-marquee-paused={paused ? "true" : "false"}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={onBlur}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        overflow: reducedMotion ? "auto hidden" : "hidden",
        paddingInline: horizontalPadding,
        ...typography,
      }}
    >
      <style>{`
        @keyframes storeblink-announcement-marquee {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(var(--marquee-cycle-distance), 0, 0); }
        }
      `}</style>
      <div
        data-announcement-marquee-track
        style={{
          display: "flex",
          width: "max-content",
          minWidth: "max-content",
          animationName: reducedMotion
            ? "none"
            : "storeblink-announcement-marquee",
          animationDuration: `${Math.max(0.1, duration)}s`,
          animationTimingFunction: "linear",
          animationIterationCount: "infinite",
          animationDirection: direction === "right" ? "reverse" : "normal",
          animationPlayState: paused ? "paused" : "running",
          willChange: paused ? "auto" : "transform",
          "--marquee-cycle-distance": `${-cycleWidth}px`,
        } as CSSProperties}
      >
        <div ref={semanticGroupRef} style={{ display: "flex", flex: "none" }}>
          <MessageGroup messages={messages} separator={separator} gap={gap} />
        </div>
        {!reducedMotion
          ? Array.from({ length: duplicateCount }, (_, index) => (
              <MessageGroup
                key={`marquee-copy-${index}`}
                messages={messages}
                separator={separator}
                gap={gap}
                duplicate
              />
            ))
          : null}
      </div>
    </div>
  );
};
