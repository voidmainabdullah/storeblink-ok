import { useEffect, useState } from "react";

export type NumberPropertyEditorProps = {
  label: string;
  value: number | undefined;
  mixed?: boolean;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: number) => void;
};

export const NumberPropertyEditor = ({
  label,
  value,
  mixed = false,
  min,
  max,
  step = 1,
  onCommit,
}: NumberPropertyEditorProps) => {
  const [draft, setDraft] = useState(mixed ? "" : String(value ?? ""));

  useEffect(() => {
    setDraft(mixed ? "" : String(value ?? ""));
  }, [mixed, value]);

  const commit = () => {
    if (draft.trim() === "") return;
    const next = Number(draft);
    if (!Number.isFinite(next)) return;
    const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, next));
    if (clamped !== value || mixed) onCommit(clamped);
  };

  return (
    <label className="grid gap-1 text-xs">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        aria-label={label}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        type="number"
        min={min}
        max={max}
        step={step}
        placeholder={mixed ? "Mixed" : undefined}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(mixed ? "" : String(value ?? ""));
        }}
      />
    </label>
  );
};
