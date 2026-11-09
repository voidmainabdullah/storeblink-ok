import { useEffect, useState } from "react";

export type TextPropertyEditorProps = {
  label: string;
  value: string | undefined;
  mixed?: boolean;
  placeholder?: string;
  onCommit: (value: string) => void;
};

export const TextPropertyEditor = ({ label, value, mixed = false, placeholder, onCommit }: TextPropertyEditorProps) => {
  const [draft, setDraft] = useState(mixed ? "" : value ?? "");

  useEffect(() => {
    setDraft(mixed ? "" : value ?? "");
  }, [mixed, value]);

  const commit = () => {
    if (draft !== (value ?? "") || mixed) onCommit(draft);
  };

  return (
    <label className="grid gap-1 text-xs">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        aria-label={label}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        placeholder={mixed ? "Mixed" : placeholder}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(mixed ? "" : value ?? "");
        }}
      />
    </label>
  );
};
