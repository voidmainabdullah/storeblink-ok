import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const ColorRow = ({ label, value, onChange, presets }: { label: string; value: string; onChange: (c: string) => void; presets: string[] }) => (
  <div>
    <Label>{label}</Label>
    <div className="flex items-center gap-2 flex-wrap mt-2">
      {presets.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)}
          className={`w-7 h-7 rounded-full border-2 transition-all ${value === c ? "border-foreground scale-110" : "border-transparent"}`}
          style={{ backgroundColor: c }} aria-label={c} />
      ))}
      <Input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-9 h-7 p-1 cursor-pointer" />
      <Input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="w-20 h-7 text-xs font-mono" maxLength={7} />
    </div>
  </div>
);

