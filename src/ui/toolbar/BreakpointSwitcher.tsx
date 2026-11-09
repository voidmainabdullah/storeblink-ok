import { Monitor, Smartphone, Tablet } from "lucide-react";
import { RESPONSIVE_BREAKPOINTS } from "@/layout/responsive";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";

const BREAKPOINT_ICONS = {
  desktop: Monitor,
  tablet: Tablet,
  mobile: Smartphone,
};

export type BreakpointSwitcherProps = {
  activeBreakpoint: ResponsiveBreakpoint;
  onChange: (breakpoint: ResponsiveBreakpoint) => void;
  widths?: Partial<Record<ResponsiveBreakpoint, number>>;
};

export const BreakpointSwitcher = ({ activeBreakpoint, onChange, widths }: BreakpointSwitcherProps) => (
  <div className="flex shrink-0 items-center rounded bg-[#202020] p-1" aria-label="Responsive preview mode">
    {(Object.keys(RESPONSIVE_BREAKPOINTS) as ResponsiveBreakpoint[]).map((breakpoint) => {
      const Icon = BREAKPOINT_ICONS[breakpoint];
      const definition = RESPONSIVE_BREAKPOINTS[breakpoint];
      const width = widths?.[breakpoint] ?? definition.width;
      const active = activeBreakpoint === breakpoint;
      return (
        <button
          key={breakpoint}
          type="button"
          aria-label={`${definition.label} ${width}px`}
          aria-pressed={active}
          title={`${definition.label} - ${width}px`}
          onClick={() => onChange(breakpoint)}
          className={`grid h-7 w-9 place-items-center rounded transition-colors ${
            active ? "bg-[#0178ff] text-white" : "text-[#b8b8b8] hover:bg-white/10 hover:text-white"
          }`}
        >
          <Icon size={14} />
        </button>
      );
    })}
    <span className="ml-1 min-w-11 px-1 text-center text-[9px] font-semibold tabular-nums text-[#b8b8b8]">
      {widths?.[activeBreakpoint] ?? RESPONSIVE_BREAKPOINTS[activeBreakpoint].width}px
    </span>
  </div>
);
