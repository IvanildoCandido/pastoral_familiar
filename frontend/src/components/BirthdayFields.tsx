import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BirthdayProfile } from "@/lib/types";

function BirthdayInput({ id, value, onChange }: { id: string; value: string | null; onChange: (value: string | null) => void }) {
  const [month = "", day = ""] = value?.split("-") ?? [];
  const maxDay = month ? new Date(2000, Number(month), 0).getDate() : 31;
  return <div className="grid grid-cols-2 gap-2">
    <div><Label htmlFor={`${id}-day`}>Dia</Label><Input id={`${id}-day`} type="number" min={1} max={maxDay} placeholder="Dia" value={day ? Number(day) : ""} required={!!month} onChange={e => onChange(e.target.value || month ? `${month}-${e.target.value ? e.target.value.padStart(2, "0") : ""}` : null)} /></div>
    <div><Label htmlFor={`${id}-month`}>Mês</Label><Input id={`${id}-month`} type="number" min={1} max={12} placeholder="Mês" value={month ? Number(month) : ""} required={!!day} onChange={e => onChange(e.target.value || day ? `${e.target.value ? e.target.value.padStart(2, "0") : ""}-${day}` : null)} /></div>
  </div>;
}

export { BirthdayInput };
export default function BirthdayFields({ value, onChange }: { value: BirthdayProfile; onChange: (value: BirthdayProfile) => void }) {
  return <fieldset className="space-y-2 rounded-xl border border-amber-900/10 p-3">
    <legend className="px-1 text-sm font-semibold">Aniversário (opcional)</legend>
    <p className="text-xs text-slate-500">Informe apenas dia e mês, sem o ano de nascimento.</p>
    <BirthdayInput id="birthday" value={value.birthday ?? null} onChange={birthday => onChange({ birthday })} />
  </fieldset>;
}
