import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

/** Live HH:MM:SS countdown. Hidden when expired or no end date. */
export const Countdown = ({
  endsAt,
  className = "",
  compact = false,
}: {
  endsAt: string | null | undefined;
  className?: string;
  compact?: boolean;
}) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  if (isNaN(end)) return null;
  const diff = end - now;
  if (diff <= 0) return null;

  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold tabular-nums ${className}`}>
        {days > 0 && <span>{days}d</span>}
        <span>{pad(hours)}:{pad(mins)}:{pad(secs)}</span>
      </span>
    );
  }

  const Cell = ({ v, l }: { v: number; l: string }) => (
    <span className="inline-flex flex-col items-center">
      <span className="bg-foreground text-background px-1 py-0.5 rounded text-[10px] font-bold tabular-nums leading-none min-w-[18px] text-center">
        {pad(v)}
      </span>
      <span className="text-[8px] text-muted-foreground mt-0.5">{l}</span>
    </span>
  );

  return (
    <div className={`inline-flex items-center gap-0.5 ${className}`}>
      {days > 0 && <><Cell v={days} l="d" /><span className="text-foreground font-bold mt-0 mb-2">:</span></>}
      <Cell v={hours} l="h" />
      <span className="text-foreground font-bold mt-0 mb-2">:</span>
      <Cell v={mins} l="m" />
      <span className="text-foreground font-bold mt-0 mb-2">:</span>
      <Cell v={secs} l="s" />
    </div>
  );
};
