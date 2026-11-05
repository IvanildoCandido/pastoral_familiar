import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Clock3, HandHeart, MessageCircle, Pencil, Plus, Search, StickyNote, Trash2, UserX } from "lucide-react";
import MemberFormDialog from "@/components/MemberFormDialog";
import MemberHistoryDialog from "@/components/MemberHistoryDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { ROLE_BADGE, ROLE_LABELS, errorMessage, fmtDate, initials, whatsappLink } from "@/lib/format";
import { isLeader, useMe, useSectors } from "@/hooks/useMe";
import type { MessageOut, User } from "@/lib/types";
import { cn } from "@/lib/utils";

type Sort = "name" | "least" | "longest" | "seen";
const SORT_LABELS: Record<Sort, string> = {
  name: "Ordenar: nome",
  least: "Quem menos serviu",
  longest: "Há mais tempo sem servir",
  seen: "Último acesso",
};

function lastSeen(iso: string | null): string {
  if (!iso) return "Nunca acessou";
  return `Acessou ${formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR })}`;
}

export default function Members() {
  const qc = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();
  const leader = isLeader(me);
  const isCoord = me?.role === "coordenador";
  const [tab, setTab] = useState<"active" | "pending">("active");
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [sort, setSort] = useState<Sort>("name");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [removing, setRemoving] = useState<User | null>(null);
  const [historyOf, setHistoryOf] = useState<User | null>(null);

  const sectors = useSectors(leader);
  const active = useQuery({ queryKey: ["members", "active"], queryFn: () => apiGet<User[]>("/members?status=active"), enabled: leader });
  const pending = useQuery({ queryKey: ["members", "pending"], queryFn: () => apiGet<User[]>("/members?status=pending"), enabled: leader });

  const sectorName: Record<string, string> = {};
  for (const s of sectors.data ?? []) sectorName[s.id] = s.name;
  const sectorLabels: Record<string, string> = { all: "Todos os setores", none: "Sem setor", ...sectorName };
  const filterSectors = isCoord ? (sectors.data ?? []) : (sectors.data ?? []).filter((s) => me?.sector_ids.includes(s.id));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["members"] });
    qc.invalidateQueries({ queryKey: ["sectors"] });
  };
  const approve = useMutation({
    mutationFn: (id: string) => apiPost<User>(`/members/${id}/approve`),
    onSuccess: (u) => { invalidate(); toast.success(`${u.name} agora tem acesso ao sistema`); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<MessageOut>(`/members/${id}`),
    onSuccess: () => { invalidate(); toast.success("Removido"); setRemoving(null); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const source = tab === "active" ? active : pending;
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (source.isError ? [] : (source.data ?? [])).filter((m) => {
      if (sectorFilter === "none" && m.sector_ids.length) return false;
      if (sectorFilter !== "all" && sectorFilter !== "none" && !m.sector_ids.includes(sectorFilter)) return false;
      return !q || m.name.toLowerCase().includes(q) || m.phone.includes(q) || m.username.includes(q);
    });
    const sorted = [...filtered];
    if (sort === "least") sorted.sort((a, b) => a.served_count - b.served_count || a.name.localeCompare(b.name));
    if (sort === "longest") sorted.sort((a, b) => (a.last_served ?? "").localeCompare(b.last_served ?? "") || a.name.localeCompare(b.name));
    if (sort === "seen") sorted.sort((a, b) => (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? ""));
    return sorted;
  }, [source.data, source.isError, search, sectorFilter, sort]);

  if (!meLoading && me && !leader) return <Navigate to="/" replace />;

  const pendingCount = pending.data?.length ?? 0;
  const myNames = (me?.sector_ids ?? []).map((id) => sectorName[id]).filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">
            {isCoord ? "Toda a pastoral" : `Setores: ${myNames}`}
          </p>
          <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight text-slate-900">Membros</h1>
        </div>
        <Button className="h-11 rounded-full px-5 transition-transform duration-100 active:scale-95"
          onClick={() => { setEditing(null); setFormOpen(true); }} data-testid="member-create-btn">
          <Plus className="size-4" /> Novo membro
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-amber-900/10 bg-white p-1" data-testid="members-tabs">
          <button type="button" onClick={() => setTab("active")} data-testid="members-tab-active"
            className={cn("rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-200",
              tab === "active" ? "bg-[#451A03] text-amber-50" : "text-[#78350F] hover:bg-amber-50")}>
            Ativos {active.data ? `(${active.data.length})` : ""}
          </button>
          <button type="button" onClick={() => setTab("pending")} data-testid="members-tab-pending"
            className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-200",
              tab === "pending" ? "bg-[#451A03] text-amber-50" : "text-[#78350F] hover:bg-amber-50")}>
            Pedidos de acesso
            {pendingCount > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] text-white" data-testid="members-pending-count">{pendingCount}</span>}
          </button>
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input className="h-10 bg-white pl-9" placeholder="Buscar por nome ou telefone" value={search}
            onChange={(e) => setSearch(e.target.value)} data-testid="members-search-input" />
        </div>
        <Select value={sectorFilter} onValueChange={setSectorFilter}>
          <SelectTrigger className="h-10 w-full bg-white sm:w-52" data-testid="members-sector-filter">
            <SelectValue>{(v) => sectorLabels[v as string] ?? "Todos os setores"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os setores</SelectItem>
            {isCoord && <SelectItem value="none">Sem setor</SelectItem>}
            {filterSectors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {tab === "active" && (
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-10 w-full bg-white sm:w-56" data-testid="members-sort-select">
              <SelectValue>{(v) => SORT_LABELS[v as Sort]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as Sort[]).map((s) => <SelectItem key={s} value={s}>{SORT_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {source.isLoading || !me ? (
        <div className="grid gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-amber-100/50" />)}</div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-amber-900/20 bg-white/60 p-10 text-center" data-testid="members-empty">
          <UserX className="mx-auto size-9 text-amber-600" />
          <p className="mt-3 font-serif text-lg text-slate-800">
            {tab === "pending" ? "Nenhum pedido de acesso pendente." : "Nenhum membro encontrado."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3" data-testid="members-list">
          {list.map((m, i) => {
            const wa = whatsappLink(m.phone);
            const canEdit = isCoord || m.role === "membro" || m.id === me.id;
            return (
              <li key={m.id} data-testid={`member-row-${m.id}`} style={{ animationDelay: `${i * 30}ms` }}
                className="flex animate-rise flex-wrap items-center gap-4 rounded-2xl border border-amber-900/10 bg-white p-4 transition-shadow duration-200 hover:shadow-md">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-amber-100 font-semibold text-[#78350F]">{initials(m.name)}</span>
                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 font-semibold text-slate-900" data-testid={`member-name-${m.id}`}>{m.name}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", ROLE_BADGE[m.role])} data-testid={`member-role-${m.id}`}>
                      {ROLE_LABELS[m.role]}
                    </span>
                    {m.sector_ids.filter((id) => sectorName[id]).map((id) => (
                      <span key={id} className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-semibold text-[#78350F]" data-testid={`member-sector-${m.id}-${id}`}>
                        {sectorName[id]}
                      </span>
                    ))}
                  </div>
                  <div className="mt-0.5 text-sm text-slate-600">
                    <span data-testid={`member-phone-${m.id}`}>{m.phone || "Sem telefone"}</span>
                    <span className="text-slate-400"> · @{m.username}</span>
                  </div>
                  {tab === "active" && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <button type="button" onClick={() => setHistoryOf(m)} data-testid={`member-served-${m.id}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#F0FDF4] px-2.5 py-1 font-semibold text-[#166534] transition-colors duration-150 hover:bg-[#DCFCE7]">
                        <HandHeart className="size-3.5" />
                        Serviu {m.served_count}x
                        {m.last_served ? ` · última em ${fmtDate(m.last_served, "dd/MM/yyyy")}` : " · nunca serviu"}
                      </button>
                      <span className="inline-flex items-center gap-1 text-slate-500" data-testid={`member-last-seen-${m.id}`}>
                        <Clock3 className="size-3.5" /> {lastSeen(m.last_seen_at)}
                      </span>
                    </div>
                  )}
                  {m.notes && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-sm text-slate-600" data-testid={`member-notes-${m.id}`}>
                      <StickyNote className="mt-0.5 size-3.5 shrink-0 text-amber-600" /> {m.notes}
                    </p>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  {wa && (
                    <a href={wa} target="_blank" rel="noreferrer" aria-label={`WhatsApp de ${m.name}`} data-testid={`member-whatsapp-${m.id}`}
                      className="rounded-full p-2 text-green-700 transition-colors duration-200 hover:bg-green-50">
                      <MessageCircle className="size-5" />
                    </a>
                  )}
                  {tab === "pending" ? (
                    <>
                      <Button size="sm" className="rounded-full bg-green-700 hover:bg-green-800" disabled={approve.isPending}
                        onClick={() => approve.mutate(m.id)} data-testid={`member-approve-btn-${m.id}`}>
                        <Check className="size-4" /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setRemoving(m)} data-testid={`member-reject-btn-${m.id}`}>
                        Recusar
                      </Button>
                    </>
                  ) : (
                    <>
                      {canEdit && (
                        <button type="button" aria-label="Editar membro" onClick={() => { setEditing(m); setFormOpen(true); }}
                          className="rounded-full p-2 text-slate-500 transition-colors duration-200 hover:bg-amber-100 hover:text-[#78350F]"
                          data-testid={`member-edit-btn-${m.id}`}>
                          <Pencil className="size-4" />
                        </button>
                      )}
                      {isCoord && m.id !== me.id && (
                        <button type="button" aria-label="Excluir membro" onClick={() => setRemoving(m)}
                          className="rounded-full p-2 text-slate-500 transition-colors duration-200 hover:bg-red-50 hover:text-red-700"
                          data-testid={`member-delete-btn-${m.id}`}>
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <MemberFormDialog open={formOpen} onOpenChange={setFormOpen} member={editing}
        sectors={(sectors.data ?? []).map((s) => ({ id: s.id, name: s.name }))} isCoord={isCoord}
        mySectorIds={me?.sector_ids ?? []} meId={me?.id} />

      <MemberHistoryDialog member={historyOf} onOpenChange={(o) => !o && setHistoryOf(null)} />

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent data-testid="member-delete-dialog">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{removing?.status === "pending" ? "Recusar pedido?" : "Excluir membro?"}</DialogTitle>
            <DialogDescription>{removing?.name} perderá o acesso ao sistema e sairá das escalas.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)} data-testid="member-delete-cancel-button">Cancelar</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => removing && remove.mutate(removing.id)} data-testid="member-delete-confirm-button">
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
