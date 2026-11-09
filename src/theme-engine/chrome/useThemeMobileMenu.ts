import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export const useThemeMobileMenu = (
  containerRef: RefObject<HTMLElement>,
) => {
  const [open, setOpen] = useState(false);
  const previouslyOpenRef = useRef(false);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((current) => !current), []);

  useEffect(() => {
    const container = containerRef.current;
    const trigger = container?.querySelector<HTMLElement>(
      '[data-theme-chrome-slot="mobile-menu-trigger"]',
    );
    if (!open) {
      if (previouslyOpenRef.current) trigger?.focus({ preventScroll: true });
      previouslyOpenRef.current = false;
      return;
    }

    previouslyOpenRef.current = true;
    const panel = container?.querySelector<HTMLElement>(
      '[data-theme-chrome-slot="mobile-menu"]',
    );
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = panel
      ? [...panel.querySelectorAll<HTMLElement>(focusableSelector)]
      : [];
    const frameId = window.requestAnimationFrame(() => {
      (focusable[0] ?? panel)?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panel?.contains(target) || trigger?.contains(target)) return;
      close();
    };
    const handlePanelClick = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("a[href]")) close();
    };
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || panel?.contains(target) || trigger?.contains(target)) return;
      (focusable[0] ?? panel)?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("focusin", handleFocusIn);
    panel?.addEventListener("click", handlePanelClick);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("focusin", handleFocusIn);
      panel?.removeEventListener("click", handlePanelClick);
      document.body.style.overflow = previousOverflow;
    };
  }, [close, containerRef, open]);

  return { open, setOpen, close, toggle };
};
