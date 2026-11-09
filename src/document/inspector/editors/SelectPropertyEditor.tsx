export type SelectPropertyEditorProps = {
  label: string;
  value: string | undefined;
  mixed?: boolean;
  options: Array<{ label: string; value: string }>;
  onCommit: (value: string) => void;
};

export const SelectPropertyEditor = ({ label, value, mixed = false, options, onCommit }: SelectPropertyEditorProps) => (
  <label className="grid gap-1 text-xs">
    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    <select
      aria-label={label}
      className="h-8 rounded-md border border-border bg-background px-2 text-xs"
      value={mixed ? "" : value ?? ""}
      onChange={(event) => {
        if (event.target.value) onCommit(event.target.value);
      }}
    >
      {mixed && <option value="">Mixed</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  </label>
);
