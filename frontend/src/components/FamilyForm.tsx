import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPost, apiPut } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import type { Family, FamilyInput, FamilyMemberOption } from "@/lib/types";
import { BirthdayInput } from "@/components/BirthdayFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooter } from "@/components/ui/dialog";

const normalized = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
const birthdayLabel = (birthday: string | null) => birthday ? birthday.split("-").reverse().join("/") : "Aniversário não informado";
const selectClass = "h-10 w-full rounded-md border bg-white px-3 text-sm";

export default function FamilyForm({ family, families, members, onDone, initial, review }: { initial?: FamilyInput; review?: {id:string;revision:string;note:string}; family: Family | null; families: Family[]; members: FamilyMemberOption[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FamilyInput>(() => initial ?? (family ? {name:family.name, people:family.people.map(p=>({...p}))} : {name:"",people:[{user_id:null,relationship:"parent",name:"",birthday:null}]}));
  const [error, setError] = useState<string | null>(null);
  const update = (index: number, fields: Partial<FamilyInput["people"][number]>) => setForm({...form,people:form.people.map((p,i)=>i===index?{...p,...fields}:p)});
  const save = useMutation({
    mutationFn: () => review ? apiPost<Family>(`/families/requests/${review.id}/approve`,{revision:review.revision,note:review.note,family_id:family?.id ?? null,family:form}) : family ? apiPut<Family>(`/families/${family.id}`,form) : apiPost<Family>("/families",form),
    onSuccess: () => { ["families","family-members","family-requests","my-family","members","birthdays","me"].forEach(key=>qc.invalidateQueries({queryKey:[key]})); toast.success(review?"Solicitação aprovada e família confirmada":"Família salva"); onDone(); },
    onError: err => { setError(errorMessage(err)); if(review) qc.invalidateQueries({queryKey:["family-requests"]}); },
  });
  return <form className="space-y-4" onSubmit={e=>{e.preventDefault();setError(null);save.mutate();}}>
    <div className="space-y-2"><Label htmlFor="family-name">Nome da família</Label><Input id="family-name" required minLength={2} maxLength={120} placeholder="Ex.: Família de Cleber e Beth" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} /></div>
    {form.people.map((person,index)=> {
      const duplicates = person.name.trim().length >= 2 ? families.filter(f=>f.id!==family?.id && f.people.some(p=>normalized(p.name)===normalized(person.name) && (!p.birthday || !person.birthday || p.birthday===person.birthday))) : [];
      const accountMatches = !person.user_id && person.name.trim().length >= 2 ? members.filter(m=>normalized(m.name)===normalized(person.name)) : [];
      return <fieldset key={person.id ?? `new-${index}`} className="space-y-3 rounded-xl border border-amber-900/15 p-3">
        <legend className="px-1 text-sm font-semibold">{person.relationship === "parent" ? "Responsável / esposo(a)" : "Filho(a)"}</legend>
        <div className="flex gap-2"><select aria-label={`Vínculo da pessoa ${index+1}`} className={selectClass} value={person.relationship} onChange={e=>update(index,{relationship:e.target.value as "parent"|"child"})}><option value="parent">Responsável / esposo(a)</option><option value="child">Filho(a)</option></select><Button type="button" variant="ghost" onClick={()=>setForm({...form,people:form.people.filter((_,i)=>i!==index)})}>Remover</Button></div>
        <div className="space-y-2"><Label htmlFor={`family-member-${index}`}>Vincular a um membro cadastrado</Label>
          <select id={`family-member-${index}`} className={selectClass} value={person.user_id ?? ""} onChange={e=> {
            const member=members.find(m=>m.id===e.target.value);
            update(index,{user_id:member?.id ?? null,name:member?.name ?? person.name,birthday:member?.birthday ?? person.birthday});
          }}>
            <option value="">Pessoa sem cadastro no sistema</option>
            {members.map(m=><option key={m.id} value={m.id} disabled={(!!m.family_id && m.family_id!==family?.id && m.id!==person.user_id) || form.people.some((p,i)=>i!==index && p.user_id===m.id)}>{m.name}{m.family_id && m.family_id!==family?.id ? ` · ${m.family_name} (use Unir famílias)` : ""}</option>)}
          </select>
        </div>
        <div className="space-y-2"><Label htmlFor={`family-person-name-${index}`}>Nome completo</Label><Input id={`family-person-name-${index}`} required minLength={2} maxLength={100} value={person.name} disabled={!!person.user_id} onChange={e=>update(index,{name:e.target.value})} /></div>
        {person.user_id ? <p className="text-sm text-slate-600">Aniversário: {birthdayLabel(person.birthday)}. Os dados vêm do cadastro do membro.</p> : <BirthdayInput id={`family-person-${index}`} value={person.birthday} onChange={birthday=>update(index,{birthday})} />}
        {accountMatches.length>0 && <p role="status" className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Já existe um membro com esse nome. Selecione o cadastro acima para evitar duplicação.</p>}
        {duplicates.length>0 && <p role="status" className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Possível cadastro existente: {duplicates.map(f=>f.name).join(", ")}. Revise a família existente e use “Unir famílias”, se forem as mesmas pessoas.</p>}
      </fieldset>;
    })}
    <div className="flex flex-wrap gap-2">
      {form.people.filter(p=>p.relationship==="parent").length<2 && <Button type="button" variant="outline" onClick={()=>setForm({...form,people:[...form.people,{user_id:null,relationship:"parent",name:"",birthday:null}]})}>Adicionar responsável / esposo(a)</Button>}
      <Button type="button" variant="outline" onClick={()=>setForm({...form,people:[...form.people,{user_id:null,relationship:"child",name:"",birthday:null}]})}>Adicionar filho(a)</Button>
    </div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <DialogFooter><Button type="button" variant="outline" disabled={save.isPending} onClick={onDone}>Cancelar</Button><Button type="submit" disabled={save.isPending}>{save.isPending?"Salvando…":review?"Confirmar família e aprovar":"Salvar família"}</Button></DialogFooter>
  </form>;
}

