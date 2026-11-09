import {
  useEffect,
  forwardRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const inspectorInputClass =
  "h-7 min-w-0 rounded border border-transparent bg-[#383838] px-2 text-[11px] text-[#f1f1f1] outline-none transition-colors hover:border-[#4a4a4a] focus:border-[#0178ff]";

export const InspectorSection = ({
  title,
  actions,
  children,
  defaultOpen = true,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-[#414141]">
      <div className="flex h-10 items-center gap-1 px-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px] font-semibold text-white"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="truncate">{title}</span>
        </button>
        {actions}
      </div>
      {open ? <div className="space-y-2.5 px-3 pb-3">{children}</div> : null}
    </section>
  );
};

export type InspectorIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  active?: boolean;
};

export const InspectorIconButton = forwardRef<HTMLButtonElement, InspectorIconButtonProps>(({
  icon: Icon,
  active,
  className,
  ...props
}, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "grid h-7 w-7 shrink-0 place-items-center rounded text-[#c8c8c8] hover:bg-[#444] hover:text-white disabled:cursor-not-allowed disabled:opacity-35",
      active && "bg-[#0178ff] text-white hover:bg-[#0178ff]",
      className,
    )}
    {...props}
  >
    <Icon size={13} strokeWidth={1.8} />
  </button>
));

InspectorIconButton.displayName = "InspectorIconButton";

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
};

export const NumberField = ({
  label,
  value,
  onCommit,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) => {
  const [draft, setDraft] = useState(formatNumber(value));
  useEffect(() => setDraft(formatNumber(value)), [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(formatNumber(value));
      return;
    }
    const next = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, parsed));
    setDraft(formatNumber(next));
    if (next !== value) onCommit(next);
  };

  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[9px] font-medium text-[#a6a6a6]">{label}</span>
      <span className="relative block">
        <input
          aria-label={label}
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(formatNumber(value));
              event.currentTarget.blur();
            }
          }}
          className={cn(inspectorInputClass, "w-full pr-7 tabular-nums")}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[#909090]">
            {suffix}
          </span>
        ) : null}
      </span>
    </label>
  );
};

export const SelectField = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) => (
  <label className="block min-w-0">
    <span className="mb-1 block text-[9px] font-medium text-[#a6a6a6]">{label}</span>
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(inspectorInputClass, "w-full")}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  </label>
);

export const RangeField = ({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) => (
  <label className="block">
    <span className="mb-1 flex items-center justify-between text-[9px] font-medium text-[#a6a6a6]">
      <span>{label}</span>
      <span className="tabular-nums text-[#d8d8d8]">{Math.round(value * 100) / 100}</span>
    </span>
    <input
      aria-label={label}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-1.5 w-full cursor-pointer accent-[#0178ff]"
    />
  </label>
);

export const SegmentedControl = ({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string; icon?: LucideIcon }>;
  value: string;
  onChange: (value: string) => void;
}) => (
  <div>
    <div className="mb-1 text-[9px] font-medium text-[#a6a6a6]">{label}</div>
    <div className="grid auto-cols-fr grid-flow-col gap-px overflow-hidden rounded bg-[#242424] p-px">
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            title={option.label}
            aria-label={option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              "grid h-7 place-items-center rounded-sm text-[10px] text-[#aaa] hover:bg-[#414141] hover:text-white",
              value === option.value && "bg-[#4a4a4a] text-white",
            )}
          >
            {Icon ? <Icon size={13} /> : option.label}
          </button>
        );
      })}
    </div>
  </div>
);

export const ToggleRow = ({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}) => (
  <label className="flex cursor-pointer items-center justify-between gap-3 py-0.5 text-[10px] text-[#ddd]">
    <span>
      <span className="block">{label}</span>
      {description ? <span className="mt-0.5 block text-[9px] text-[#8f8f8f]">{description}</span> : null}
    </span>
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="h-3.5 w-3.5 accent-[#0178ff]"
    />
  </label>
);
