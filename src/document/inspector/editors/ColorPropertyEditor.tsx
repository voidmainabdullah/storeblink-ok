export type ColorPropertyEditorProps = {
  label: string;
  value: string | undefined;
  mixed?: boolean;
  fallback?: string;
  onCommit: (value: string) => void;
};

export const ColorPropertyEditor = ({ label, value, mixed = false, fallback = "#000000", onCommit }: ColorPropertyEditorProps) => {
  const displayValue = mixed ? fallback : value ?? fallback;
  return (
    <label className="grid gap-1 text-xs">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}{mixed ? " · Mixed" : ""}</span>
      <input
        aria-label={label}
        className="h-8 rounded-md border border-border bg-background p-1"
        type="color"
        value={displayValue}
        onChange={(event) => onCommit(event.target.value)}
      />
    </label>
  );
};
