export const TemplatePreview = ({ id, color }: { id: string; color: string }) => {
  if (id === "minimal") {
    return (
      <div className="rounded-md overflow-hidden border border-border bg-background h-32">
        <div className="h-2 bg-foreground/5 flex items-center px-2 gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-foreground/20" />
          <div className="w-1.5 h-1.5 rounded-full bg-foreground/20" />
        </div>
        <div className="p-2 grid grid-cols-3 gap-1">
          <div className="aspect-square rounded bg-muted" />
          <div className="aspect-square rounded bg-muted" />
          <div className="aspect-square rounded bg-muted" />
        </div>
        <div className="px-2 pb-2"><div className="h-1 w-1/3 bg-foreground rounded" /></div>
      </div>
    );
  }
  if (id === "bold") {
    return (
      <div className="rounded-md overflow-hidden border border-border h-32 relative" style={{ background: `linear-gradient(135deg, ${color}, ${color}88)` }}>
        <div className="absolute inset-0 p-3 text-white flex flex-col justify-between">
          <div className="text-[10px] font-bold tracking-widest opacity-80">SHOP</div>
          <div>
            <div className="text-base font-bold leading-none">BIG.</div>
            <div className="text-base font-bold leading-none">BOLD.</div>
          </div>
          <div className="flex gap-1">
            <div className="w-6 h-6 rounded bg-white/30" />
            <div className="w-6 h-6 rounded bg-white/30" />
          </div>
        </div>
      </div>
    );
  }
  if (id === "editorial") {
    return (
      <div className="rounded-md overflow-hidden border border-border bg-background h-32 grid grid-cols-2">
        <div className="p-2 flex flex-col justify-center bg-muted/40">
          <div className="h-1 w-3/4 bg-foreground rounded mb-1" />
          <div className="h-1 w-1/2 bg-foreground/40 rounded" />
        </div>
        <div className="p-2 grid grid-cols-2 gap-1">
          <div className="aspect-square rounded" style={{ backgroundColor: `${color}40` }} />
          <div className="aspect-square rounded bg-muted" />
          <div className="aspect-square rounded bg-muted" />
          <div className="aspect-square rounded" style={{ backgroundColor: `${color}40` }} />
        </div>
      </div>
    );
  }
  if (id === "marketplace") {
    return (
      <div className="rounded-md overflow-hidden border border-border bg-background h-32">
        <div className="h-3 flex items-center px-2 gap-1" style={{ background: color }}>
          <div className="h-1 w-8 bg-white/70 rounded" />
          <div className="h-1 flex-1 bg-white/30 rounded ml-1" />
        </div>
        <div className="h-1.5 bg-muted/50 flex items-center px-1 gap-1">
          {[...Array(5)].map((_, i) => <div key={i} className="h-0.5 w-3 bg-foreground/30 rounded" />)}
        </div>
        <div className="p-1.5 grid grid-cols-4 gap-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="aspect-square rounded-sm bg-muted relative">
              {i % 3 === 0 && <div className="absolute top-0 left-0 h-1 w-2 rounded-sm" style={{ background: color }} />}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (id === "thread") {
    return (
      <div className="rounded-md overflow-hidden border border-border h-32 bg-[#F7F5F1] relative">
        <div className="h-3 flex items-center justify-between px-2 border-b border-black/10">
          <div className="h-1.5 w-8 bg-black rounded" />
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-black/40" />
            <div className="w-1.5 h-1.5 rounded-full bg-black/40" />
            <div className="w-1.5 h-1.5 rounded-full bg-black/40" />
          </div>
        </div>
        <div className="absolute inset-x-2 top-6 flex items-center justify-center">
          <div className="text-black font-black leading-none tracking-tighter" style={{ fontSize: 24, fontFamily: "'Archivo Black',sans-serif" }}>TIMELESS</div>
        </div>
        <div className="absolute inset-x-2 top-14 flex items-center justify-center">
          <div className="text-black font-black leading-none tracking-tighter" style={{ fontSize: 24, fontFamily: "'Archivo Black',sans-serif" }}>TRENDS</div>
        </div>
        <div className="absolute left-2 top-6 w-6 h-8 rounded" style={{ background: color }} />
        <div className="absolute right-2 top-6 w-4 h-4 rounded-full bg-black" />
        <div className="absolute bottom-1 left-2 right-2 flex justify-between text-[6px] uppercase text-black/60 tracking-widest">
          <span>Define style</span><span>// 2025</span>
        </div>
      </div>
    );
  }
  // lookbook
  return (
    <div className="rounded-md overflow-hidden border border-border h-32 grid grid-cols-3 gap-0.5 bg-background">
      <div className="row-span-2 relative" style={{ background: `linear-gradient(180deg, ${color}55, ${color}aa)` }}>
        <div className="absolute bottom-1 left-1 right-1 h-1 bg-white/70 rounded" />
      </div>
      <div className="bg-muted relative">
        <div className="absolute bottom-1 left-1 right-1 h-0.5 bg-foreground/40 rounded" />
      </div>
      <div className="bg-muted/60" />
      <div className="bg-muted/60" />
      <div className="bg-muted relative">
        <div className="absolute bottom-1 left-1 right-1 h-0.5 bg-foreground/40 rounded" />
      </div>
    </div>
  );
};
