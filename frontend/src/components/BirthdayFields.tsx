import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { BirthdayProfile, FamilyMember } from "@/lib/types";

function BirthdayInput({ id, value, onChange }: { id: string; value: string | null; onChange: (value: string | null) => void }) {
  const [month = "", day = ""] = value?.split("-") ?? [];
  const maxDay = month ? new Date(2000, Number(month), 0).getDate() : 31;
  return <div className="grid grid-cols-2 gap-2">
    <div><Label htmlFor={`${id}-day`}>Dia</Label><Input id={`${id}-day`} type="number" min={1} max={maxDay} placeholder="Dia" value={day ? Number(day) : ""} required={!!month} onChange={e => onChange(e.target.value || month ? `${month}-${e.target.value ? e.target.value.padStart(2, "0") : ""}` : null)} /></div>
    <div><Label htmlFor={`${id}-month`}>Mês</Label><Input id={`${id}-month`} type="number" min={1} max={12} placeholder="Mês" value={month ? Number(month) : ""} required={!!day} onChange={e => onChange(e.target.value || day ? `${e.target.value ? e.target.value.padStart(2, "0") : ""}-${day}` : null)} /></div>
  </div>;
}

export default function BirthdayFields({ value, onChange }: { value: BirthdayProfile; onChange: (value: BirthdayProfile) => void }) {
  const family = value.family_members ?? [];
  const update = (index: number, fields: Partial<FamilyMember>) => onChange({ ...value, family_members: family.map((relative, i) => i === index ? { ...relative, ...fields } : relative) });
  const add = (relationship: FamilyMember["relationship"]) => onChange({ ...value, family_members: [...family, { name: "", relationship, birthday: null }] });
  return <fieldset className="space-y-4 rounded-xl border border-amber-900/10 p-3">
    <legend className="px-1 text-sm font-semibold">Aniversário e família (opcional)</legend>
    <p className="text-xs text-slate-500">Informe apenas dia e mês, sem o ano de nascimento.</p>
    <BirthdayInput id="birthday" value={value.birthday ?? null} onChange={birthday => onChange({ ...value, birthday })} />
    {family.map((relative, index) => <div key={index} className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between"><Label htmlFor={`family-${index}-name`}>{relative.relationship === "spouse" ? "Nome do esposo ou esposa" : "Nome do filho ou filha"}</Label><Button type="button" variant="ghost" onClick={() => onChange({ ...value, family_members: family.filter((_, i) => i !== index) })}>Remover</Button></div>
      <Input id={`family-${index}-name`} required minLength={2} maxLength={100} value={relative.name} onChange={e => update(index, { name: e.target.value })} />
      <BirthdayInput id={`family-${index}-birthday`} value={relative.birthday} onChange={birthday => update(index, { birthday })} />
    </div>)}
    <div className="flex flex-wrap gap-2">
      {!family.some(relative => relative.relationship === "spouse") && <Button type="button" variant="outline" onClick={() => add("spouse")}>Adicionar esposo(a)</Button>}
      <Button type="button" variant="outline" onClick={() => add("child")}>Adicionar filho(a)</Button>
    </div>
  </fieldset>;
}
