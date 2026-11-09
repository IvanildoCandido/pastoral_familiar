import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Users, Search, Pencil, Merge, Trash2 } from "lucide-react";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { useMe } from "@/hooks/useMe";
import type { Family, FamilyMemberOption, MessageOut } from "@/lib/types";
import FamilyForm from "@/components/FamilyForm";
import FamilyRequestInbox from "@/components/FamilyRequestInbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const normalized = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
const birthdayLabel = (birthday: string | null) => birthday ? birthday.split("-").reverse().join("/") : "Aniversário não informado";
const selectClass = "h-10 w-full rounded-md border bg-white px-3 text-sm";


export default function Families() {
  const {data:me,isLoading:meLoading}=useMe();
  const qc=useQueryClient();
  const [params,setParams]=useSearchParams();
  const [search,setSearch]=useState("");
  const [editing,setEditing]=useState<Family|null>(null);
  const [open,setOpen]=useState(false);
  const [merging,setMerging]=useState<Family|null>(null);
  const [source,setSource]=useState("");
  const [removing,setRemoving]=useState<Family|null>(null);
  const coordinator=me?.role==="coordenador";
  const families=useQuery({queryKey:["families"],queryFn:()=>apiGet<Family[]>("/families"),enabled:coordinator});
  const members=useQuery({queryKey:["family-members"],queryFn:()=>apiGet<FamilyMemberOption[]>("/families/member-options"),enabled:coordinator});
  const invalidate=()=>["families","family-members","family-requests","my-family","members","birthdays","me"].forEach(key=>qc.invalidateQueries({queryKey:[key]}));
  const merge=useMutation({mutationFn:()=>apiPost<Family>(`/families/${merging!.id}/merge`,{source_id:source}),onSuccess:()=>{invalidate();setMerging(null);setSource("");toast.success("Famílias unidas; pessoas repetidas foram reunidas em um único cadastro");},onError:err=>toast.error(errorMessage(err))});
  const remove=useMutation({mutationFn:()=>apiDelete<MessageOut>(`/families/${removing!.id}`),onSuccess:()=>{invalidate();setRemoving(null);toast.success("Grupo familiar removido");},onError:err=>toast.error(errorMessage(err))});
  if (!meLoading && me && !coordinator) return <Navigate to="/" replace />;
  const list=(families.data??[]).filter(f=>(!params.get("familia") || f.id===params.get("familia")) && (!search || normalized(`${f.name} ${f.people.map(p=>p.name).join(" ")}`).includes(normalized(search))));
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-amber-700">Coordenação</p><h1 className="mt-1 font-serif text-4xl text-slate-900">Famílias</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">Reúna os responsáveis e os filhos em uma única família. Esposo(a) é opcional e cada pessoa tem apenas um registro.</p></div><Button onClick={()=>{setEditing(null);setOpen(true);}} disabled={!members.data || families.isError}><Plus className="size-4" />Nova família</Button></div>
    <FamilyRequestInbox families={families.data??[]} members={members.data??[]} ready={!!families.data && !!members.data} enabled={coordinator} />
    <div className="flex flex-wrap items-center gap-3"><div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-3 size-4 text-slate-400" /><Input className="bg-white pl-9" placeholder="Buscar família, responsável ou filho(a)" aria-label="Buscar família, responsável ou filho(a)" value={search} onChange={e=>setSearch(e.target.value)} /></div>{params.get("familia") && <Button variant="outline" onClick={()=>setParams({})}>Ver todas as famílias</Button>}<Link to="/membros" className="text-sm font-semibold text-amber-800 hover:underline">Cadastros de membros</Link></div>
    {families.isError || members.isError ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">Não foi possível carregar os dados. <button className="underline" onClick={()=>{families.refetch();members.refetch();}}>Tentar novamente</button></div> : meLoading || families.isLoading || members.isLoading ? <p>Carregando famílias…</p> : list.length===0 ? <div className="rounded-2xl border border-dashed bg-white p-8 text-center"><Users className="mx-auto size-8 text-amber-700" /><p className="mt-3">Nenhuma família encontrada.</p><p className="mt-1 text-sm text-slate-500">Busque pelo nome dos filhos antes de criar uma família.</p></div> : <div className="grid gap-4 lg:grid-cols-2">{list.map(f=><section key={f.id} className="space-y-4 rounded-2xl border border-amber-900/10 bg-white p-5" data-testid={`family-${f.id}`}>
      <h2 className="font-serif text-2xl text-amber-950">{f.name}</h2>
      {(["parent","child"] as const).map(role=><div key={role}><h3 className="text-xs font-bold uppercase text-amber-700">{role==="parent"?"Responsáveis / casal":"Filhos"}</h3><ul className="mt-2 space-y-2">{f.people.filter(p=>p.relationship===role).map(p=><li key={p.id} className="text-sm"><strong>{p.name}</strong><span className="text-slate-500"> · {birthdayLabel(p.birthday)}{p.user_id?" · membro cadastrado":""}</span></li>)}</ul>{role==="child" && !f.people.some(p=>p.relationship==="child") && <p className="mt-2 text-sm text-slate-500">Nenhum filho cadastrado.</p>}</div>)}
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>{setEditing(f);setOpen(true);}}><Pencil className="size-4" />Editar família</Button>{(families.data??[]).length>1 && <Button variant="outline" onClick={()=>{setMerging(f);setSource("");}}><Merge className="size-4" />Unir famílias</Button>}<Button variant="ghost" aria-label={`Remover ${f.name}`} onClick={()=>setRemoving(f)}><Trash2 className="size-4" /></Button></div>
    </section>)}</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{editing?"Editar família":"Nova família"}</DialogTitle><DialogDescription>Vincule membros existentes ou informe familiares sem conta. Os filhos são compartilhados pelos responsáveis.</DialogDescription></DialogHeader>{open && <FamilyForm family={editing} families={families.data??[]} members={members.data??[]} onDone={()=>setOpen(false)} />}</DialogContent></Dialog>
    <Dialog open={!!merging} onOpenChange={o=>{if(!o&&!merge.isPending)setMerging(null);}}><DialogContent><DialogHeader><DialogTitle>Unir famílias</DialogTitle><DialogDescription>Os integrantes da família selecionada serão reunidos em {merging?.name}. Filhos com mesmo nome e aniversário compatível terão um único registro. A família selecionada deixará de existir separadamente.</DialogDescription></DialogHeader><Label htmlFor="merge-source">Família que será incorporada</Label><select id="merge-source" className={selectClass} value={source} onChange={e=>setSource(e.target.value)}><option value="">Selecione uma família</option>{(families.data??[]).filter(f=>f.id!==merging?.id).map(f=><option key={f.id} value={f.id}>{f.name} · {f.people.map(p=>p.name).join(", ")}</option>)}</select><DialogFooter><Button variant="outline" disabled={merge.isPending} onClick={()=>setMerging(null)}>Cancelar</Button><Button disabled={!source||merge.isPending} onClick={()=>merge.mutate()}>{merge.isPending?"Unindo…":"Confirmar união"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!removing} onOpenChange={o=>{if(!o&&!remove.isPending)setRemoving(null);}}><DialogContent><DialogHeader><DialogTitle>Remover {removing?.name}?</DialogTitle><DialogDescription>Isso remove o grupo, os vínculos e os familiares sem conta, incluindo seus aniversários. Os cadastros de membros serão preservados.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={remove.isPending} onClick={()=>setRemoving(null)}>Cancelar</Button><Button variant="destructive" disabled={remove.isPending} onClick={()=>remove.mutate()}>Remover família</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
