import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useOutsideDismiss } from "@/editor/hooks/useOutsideDismiss";

export const SimpleDropdown = ({
  trigger,
  children,
  align = "left",
  width = 220,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: number;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useOutsideDismiss<HTMLDivElement>(open, () => setOpen(false));

  return (
    <div ref={ref} className="relative inline-block">
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open && (
        <div
          style={{ width }}
          className={`sb-editor-floating absolute z-40 top-full mt-1.5 rounded-lg border py-1 ${align === "right" ? "right-0" : "left-0"}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};

export const DropdownRow = ({
  icon: Icon,
  label,
  hint,
  onClick,
  danger,
  disabled,
}: {
  icon?: ComponentType<any>;
  label: string;
  hint?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed ${danger ? "text-destructive hover:bg-destructive/10" : ""}`}
  >
    {Icon && <Icon size={13} className="shrink-0" />}
    <span className="flex-1 truncate">{label}</span>
    {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
  </button>
);

export const FixedMenu = ({
  x,
  y,
  onClose,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
}) => {
  const ref = useOutsideDismiss<HTMLDivElement>(true, onClose);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const width = 220;
    const height = 360;
    const left = Math.min(x, window.innerWidth - width - 8);
    const top = Math.min(y, window.innerHeight - height - 8);
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y]);

  return (
    <div
      ref={ref}
      style={{ position: "fixed", left: pos.left, top: pos.top, width: 220, zIndex: 80 }}
      className="sb-editor-floating rounded-lg border py-1"
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
};

export const MenuDivider = () => <div className="my-1 h-px bg-border" />;
