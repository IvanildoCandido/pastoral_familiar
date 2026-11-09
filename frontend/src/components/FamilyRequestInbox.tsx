import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import type { Family, FamilyInput, FamilyMemberOption, FamilyRequest, MessageOut } from "@/lib/types";
import FamilyForm from "@/components/FamilyForm";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const normalized=(name:string)=>name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().replace(/\s+/g," ").toLowerCase();
const birthday=(date:string|null)=>date?date.split("-").reverse().join("/"):"Aniversário não informado";

function proposedFamily(request:FamilyRequest,target:Family|null,members:FamilyMemberOption[]):FamilyInput {
  const people:FamilyInput["people"]=target?.people.map(p=>({...p}))??[];
  const submitter=members.find(m=>m.id===request.submitted_by);
  if(submitter && !people.some(p=>p.user_id===submitter.id)) {
    const manual=people.find(p=>normalized(p.name)===normalized(submitter.name) && !p.user_id);
    if(manual) Object.assign(manual,{user_id:submitter.id,name:submitter.name,birthday:submitter.birthday});
    else people.push({user_id:submitter.id,name:submitter.name,birthday:submitter.birthday,relationship:"parent"});
  }
  for(const person of request.information.people) {
    const existing=people.find(p=>normalized(p.name)===normalized(person.name));
    if(existing) {if(!existing.user_id && !existing.birthday) existing.birthday=person.birthday;continue;}
    const matches=members.filter(m=>normalized(m.name)===normalized(person.name) && (!m.family_id || m.family_id===target?.id));
    const account=matches.length===1?matches[0]:null;
    people.push({user_id:account?.id??null,name:account?.name??person.name,birthday:account?account.birthday:person.birthday,relationship:person.relationship==="spouse"?"parent":"child"});
  }
  return {name:target?.name??`Família de ${request.submitted_by_name}`.slice(0,120),people};
}

function Review({ request, families, members, onDone }: {request:FamilyRequest;families:Family[];members:FamilyMemberOption[];onDone:()=>void}) {
  const [targetId,setTargetId]=useState(()=>members.find(m=>m.id===request.submitted_by)?.family_id??"");
  const [note,setNote]=useState("");
  const target=families.find(f=>f.id===targetId)??null;
  return <div className="space-y-4">
    <div className="rounded-xl bg-amber-50 p-3 text-sm"><p className="font-semibold">Informações enviadas por {request.submitted_by_name}</p><ul className="mt-2 space-y-1">{request.information.people.map((p,i)=><li key={i}>{p.name} · {p.relationship==="spouse"?"Esposo(a)":"Filho(a)"} · {birthday(p.birthday)}</li>)}</ul>{request.information.note && <p className="mt-2 whitespace-pre-wrap">{request.information.note}</p>}</div>
    <div className="space-y-2"><Label htmlFor="review-family-target">Família em que os vínculos serão confirmados</Label><select id="review-family-target" className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={targetId} onChange={e=>setTargetId(e.target.value)}><option value="">Criar uma nova família</option>{families.map(f=><option key={f.id} value={f.id}>{f.name} · {f.people.map(p=>p.name).join(", ")}</option>)}</select></div>
    <p className="text-sm text-slate-600">Confira as sugestões abaixo. Pessoas já presentes na família são reaproveitadas. Para membros com conta, vale o aniversário do cadastro. Se houver informações divergentes, corrija o registro ou devolva a solicitação. Se duas famílias já existirem, use “Unir famílias” antes de aprovar.</p>
    <div className="space-y-2"><Label htmlFor="approval-note">Retorno para o membro (opcional)</Label><Textarea id="approval-note" maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} /></div>
    <FamilyForm key={targetId||"new"} family={target} initial={proposedFamily(request,target,members)} families={families} members={members} review={{id:request.id,revision:request.revision,note}} onDone={onDone} />
  </div>;
}

export default function FamilyRequestInbox({ families,members,ready,enabled }: {families:Family[];members:FamilyMemberOption[];ready:boolean;enabled:boolean}) {
  const qc=useQueryClient();
  const requests=useQuery({queryKey:["family-requests"],queryFn:()=>apiGet<FamilyRequest[]>("/families/requests"),enabled});
  const [review,setReview]=useState<FamilyRequest|null>(null);
  const [returning,setReturning]=useState<FamilyRequest|null>(null);
  const [note,setNote]=useState("");
  const reject=useMutation({mutationFn:()=>apiPost<MessageOut>(`/families/requests/${returning!.id}/reject`,{revision:returning!.revision,note}),onSuccess:()=>{qc.invalidateQueries({queryKey:["family-requests"]});qc.invalidateQueries({queryKey:["my-family"]});setReturning(null);toast.success("Solicitação devolvida para correção");},onError:err=>toast.error(errorMessage(err))});
  return <section className="space-y-4 rounded-2xl border border-amber-300 bg-amber-50/60 p-4 sm:p-5" data-testid="family-request-inbox">
    <h2 className="font-serif text-2xl">Informações aguardando revisão {requests.data?`(${requests.data.length})`:""}</h2>
    {requests.isError?<p role="alert" className="text-sm text-red-700">Não foi possível carregar as solicitações. <button className="underline" onClick={()=>requests.refetch()}>Tentar novamente</button></p>:requests.isLoading?<p className="text-sm">Carregando solicitações…</p>:requests.data?.length===0?<p className="text-sm text-slate-600">Nenhuma solicitação pendente. Os membros podem enviar os dados em “Minha família” ou ao solicitar cadastro.</p>:<ul className="space-y-3">{requests.data?.map(request=><li key={request.id} className="rounded-xl border border-amber-900/10 bg-white p-4"><h3 className="font-semibold">{request.submitted_by_name}</h3><ul className="mt-2 space-y-1 text-sm text-slate-700">{request.information.people.map((p,i)=><li key={i}>{p.name} · {p.relationship==="spouse"?"Esposo(a)":"Filho(a)"} · {birthday(p.birthday)}</li>)}</ul>{request.information.note&&<p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{request.information.note}</p>}{request.submitter_status==="pending"&&<p className="mt-2 text-sm text-amber-800">Aguardando aprovação do cadastro de acesso em Membros.</p>}<div className="mt-3 flex flex-wrap gap-2"><Button disabled={!ready||request.submitter_status!=="active"} onClick={()=>setReview(request)}>Conferir e vincular</Button><Button variant="outline" onClick={()=>{setReturning(request);setNote("");}}>Devolver para correção</Button></div></li>)}</ul>}
    <Dialog open={!!review} onOpenChange={o=>{if(!o)setReview(null);}}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Conferir informações e confirmar família</DialogTitle><DialogDescription>Revise os nomes, aniversários e vínculos antes de aprovar.</DialogDescription></DialogHeader>{review&&<Review request={review} families={families} members={members} onDone={()=>setReview(null)} />}</DialogContent></Dialog>
    <Dialog open={!!returning} onOpenChange={o=>{if(!o&&!reject.isPending)setReturning(null);}}><DialogContent><DialogHeader><DialogTitle>Devolver informações para correção</DialogTitle><DialogDescription>Explique a {returning?.submitted_by_name} o que precisa ser corrigido.</DialogDescription></DialogHeader><Label htmlFor="return-reason">Motivo da devolução</Label><Textarea id="return-reason" minLength={2} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} /><DialogFooter><Button variant="outline" disabled={reject.isPending} onClick={()=>setReturning(null)}>Cancelar</Button><Button disabled={note.trim().length<2||reject.isPending} onClick={()=>reject.mutate()}>Devolver para correção</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
