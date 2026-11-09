import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import FamilyInformationFields, { EMPTY_FAMILY_INFORMATION } from "@/components/FamilyInformationFields";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api";
import { errorMessage, fmtDate } from "@/lib/format";
import { useMe } from "@/hooks/useMe";
import type { FamilyInformation, MessageOut, MyFamilyInformation } from "@/lib/types";

function InformationForm({ initial, hasPending }: { initial: FamilyInformation; hasPending:boolean }) {
  const qc=useQueryClient();
  const [form,setForm]=useState(initial);
  const [error,setError]=useState<string|null>(null);
  const send=useMutation({mutationFn:()=>apiPost<MessageOut>("/family-requests",form),onSuccess:()=>{qc.invalidateQueries({queryKey:["my-family"]});qc.invalidateQueries({queryKey:["family-requests"]});toast.success("Informações enviadas para revisão do coordenador");},onError:err=>setError(errorMessage(err))});
  return <form className="space-y-4" onSubmit={e=>{e.preventDefault();setError(null);send.mutate();}}>
    <FamilyInformationFields value={form} onChange={setForm} />
    {hasPending && <p className="text-sm text-amber-800">Já existe um envio aguardando revisão. Ao enviar novamente, você atualiza as informações pendentes.</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <Button type="submit" disabled={form.people.length===0 || send.isPending}>{send.isPending?"Enviando…":hasPending?"Atualizar informações pendentes":"Enviar para revisão"}</Button>
  </form>;
}

export default function MyFamily() {
  const {data:me}=useMe();
  const info=useQuery({queryKey:["my-family"],queryFn:()=>apiGet<MyFamilyInformation>("/family-requests/mine"),enabled:!!me});
  const latest=info.data?.requests[0];
  return <div className="mx-auto max-w-2xl space-y-6">
    <div><p className="text-xs font-bold uppercase tracking-wider text-amber-700">Informações para a coordenação</p><h1 className="mt-1 font-serif text-4xl text-slate-900">Minha família</h1><p className="mt-3 text-sm text-slate-600">Envie ou corrija os nomes e aniversários dos seus familiares. Somente o coordenador confirma os vínculos e evita cadastros repetidos.</p></div>
    {info.isError ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">Não foi possível carregar suas informações. <button className="underline" onClick={()=>info.refetch()}>Tentar novamente</button></p> : info.isLoading || !me ? <p>Carregando informações…</p> : <>
      {info.data?.family && <section className="rounded-2xl border border-amber-900/10 bg-white p-5"><h2 className="font-serif text-2xl">{info.data.family.name}</h2><p className="mt-1 text-xs font-semibold uppercase text-green-800">Família confirmada pela coordenação</p><ul className="mt-3 space-y-2">{info.data.family.people.map(p=><li key={p.id} className="text-sm"><strong>{p.name}</strong> · {p.relationship==="child"?"Filho(a)":"Responsável"} · {p.birthday?p.birthday.split("-").reverse().join("/"):"Aniversário não informado"}</li>)}</ul></section>}
      <InformationForm key={latest?.revision??"new"} initial={latest?.information??EMPTY_FAMILY_INFORMATION} hasPending={latest?.status==="pending"} />
      {(info.data?.requests.length??0)>0 && <section className="space-y-3"><h2 className="font-serif text-2xl">Acompanhar envios</h2>{info.data?.requests.map(request=><article key={request.id} className="rounded-xl border border-amber-900/10 bg-white p-4"><p className="text-sm font-semibold">{request.status==="pending"?"Aguardando revisão do coordenador":request.status==="approved"?"Conferido e aprovado":"Devolvido para correção"}</p><p className="mt-1 text-xs text-slate-500">Enviado em {fmtDate(request.updated_at.slice(0,10),"dd/MM/yyyy")}</p><ul className="mt-2 space-y-1 text-sm">{request.information.people.map((p,i)=><li key={i}>{p.name} · {p.relationship==="spouse"?"Esposo(a)":"Filho(a)"} · {p.birthday?p.birthday.split("-").reverse().join("/"):"Aniversário não informado"}</li>)}</ul>{request.review_note && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Retorno do coordenador: {request.review_note}</p>}</article>)}</section>}
    </>}
  </div>;
}
