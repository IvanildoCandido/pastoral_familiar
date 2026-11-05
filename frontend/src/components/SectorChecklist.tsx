import { Checkbox } from "@/components/ui/checkbox";
import type { SectorOption } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  sectors: SectorOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  testid: string;
}

export default function SectorChecklist({ sectors, value, onChange, testid }: Props) {
  if (sectors.length === 0) return <p className="text-sm text-slate-500">Nenhum setor disponível.</p>;
  return (
    <div className="flex flex-wrap gap-2" data-testid={testid}>
      {sectors.map((s) => {
        const on = value.includes(s.id);
        return (
          <label key={s.id} data-testid={`${testid}-option-${s.id}`}
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-150",
              on ? "border-amber-600 bg-amber-100 text-[#78350F]" : "border-slate-200 bg-white text-slate-700 hover:bg-amber-50",
            )}>
            <Checkbox checked={on}
              onCheckedChange={(c) => onChange(c ? [...value, s.id] : value.filter((v) => v !== s.id))} />
            {s.name}
          </label>
        );
      })}
    </div>
  );
}
