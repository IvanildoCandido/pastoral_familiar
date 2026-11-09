import type { FamilyInformation } from "@/lib/types";
import { BirthdayInput } from "@/components/BirthdayFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const EMPTY_FAMILY_INFORMATION: FamilyInformation = {people:[],note:""};

export default function FamilyInformationFields({ value, onChange }: { value: FamilyInformation; onChange: (value: FamilyInformation) => void }) {
  const update=(index:number,fields:Partial<FamilyInformation["people"][number]>)=>onChange({...value,people:value.people.map((p,i)=>i===index?{...p,...fields}:p)});
  const add=(relationship:"spouse"|"child")=>onChange({...value,people:[...value.people,{name:"",birthday:null,relationship}]});
  return <fieldset className="space-y-4 rounded-xl border border-amber-900/15 p-4" data-testid="family-information-fields">
    <legend className="px-1 text-sm font-semibold">Informações da família (opcional)</legend>
    <p className="text-sm text-slate-600">Informe o nome completo e o dia e mês de aniversário do esposo(a) e dos filhos. O coordenador vai conferir os cadastros e confirmar os vínculos. O envio não altera a família nem o calendário automaticamente.</p>
    {value.people.map((person,index)=><fieldset key={index} className="space-y-2 border-t pt-3">
      <legend className="pt-3 text-sm font-semibold">{person.relationship==="spouse"?"Esposo(a)":"Filho(a)"}</legend>
      <div className="flex items-end gap-2"><div className="flex-1 space-y-1"><Label htmlFor={`reported-person-${index}`}>Nome completo</Label><Input id={`reported-person-${index}`} required minLength={2} maxLength={100} value={person.name} onChange={e=>update(index,{name:e.target.value})} /></div><Button type="button" variant="ghost" aria-label={`Remover ${person.relationship==="spouse"?"esposo(a)":"filho(a)"} ${index+1}`} onClick={()=>onChange({...value,people:value.people.filter((_,i)=>i!==index)})}>Remover</Button></div>
      <BirthdayInput id={`reported-birthday-${index}`} value={person.birthday} onChange={birthday=>update(index,{birthday})} />
    </fieldset>)}
    <div className="flex flex-wrap gap-2">{!value.people.some(p=>p.relationship==="spouse") && <Button type="button" variant="outline" onClick={()=>add("spouse")}>Informar esposo(a)</Button>}<Button type="button" variant="outline" onClick={()=>add("child")}>Informar filho(a)</Button></div>
    {value.people.length>0 && <div className="space-y-2"><Label htmlFor="reported-family-note">Observações para o coordenador</Label><Textarea id="reported-family-note" rows={2} maxLength={1000} placeholder="Ex.: meu esposo também pediu cadastro; este filho já foi informado pela mãe." value={value.note} onChange={e=>onChange({...value,note:e.target.value})} /></div>}
  </fieldset>;
}
