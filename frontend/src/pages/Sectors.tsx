import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LayoutGrid, Pencil, Plus, Trash2, Users } from "lucide-react";
import SectorFormDialog from "@/components/SectorFormDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiDelete } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { useMe, useSectors } from "@/hooks/useMe";
import type { MessageOut, Sector } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function Sectors() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const isCoord = me?.role === "coordenador";
  const sectors = useSectors(!!me);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Sector | null>(null);
  const [deleting, setDeleting] = useState<Sector | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => apiDelete<MessageOut>(`/sectors/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sectors"] });
      qc.invalidateQueries({ queryKey: ["sector-options"] });
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      toast.success("Setor removido");
      setDeleting(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const list = sectors.isError ? [] : (sectors.data ?? []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Organização</p>
          <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight text-slate-900">Setores</h1>
          <p className="mt-1 text-slate-600">Grupos de serviço da pastoral e seus responsáveis.</p>
        </div>
        {isCoord && (
          <Button className="h-11 rounded-full px-5 transition-transform duration-100 active:scale-95"
            onClick={() => { setEditing(null); setFormOpen(true); }} data-testid="sector-create-btn">
            <Plus className="size-4" /> Novo setor
          </Button>
        )}
      </div>

      {sectors.isLoading || !me ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-amber-100/50" />)}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-amber-900/20 bg-white/60 p-10 text-center" data-testid="sectors-empty">
          <LayoutGrid className="mx-auto size-9 text-amber-600" />
          <p className="mt-3 font-serif text-lg text-slate-800">Nenhum setor cadastrado ainda.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="sectors-grid">
          {list.map((s, i) => (
            <article key={s.id} data-testid={`sector-card-${s.id}`} style={{ animationDelay: `${i * 60}ms` }}
              className={cn(
                "flex animate-rise flex-col rounded-2xl border border-amber-900/10 bg-[#FDFCFA] p-5 shadow-[0_4px_20px_-4px_rgba(69,26,3,0.06)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md",
                me.sector_ids.includes(s.id) && "ring-2 ring-amber-500/60",
              )}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-serif text-2xl font-semibold text-slate-900" data-testid={`sector-name-${s.id}`}>{s.name}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2.5 py-1 text-xs font-semibold text-[#78350F]"
                  data-testid={`sector-member-count-${s.id}`}>
                  <Users className="size-3.5" /> {s.member_count}
                </span>
              </div>
              {s.description && <p className="mt-2 text-sm text-slate-600">{s.description}</p>}
              <div className="mt-4 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Responsáveis</p>
                <p className="mt-1 text-sm text-slate-800" data-testid={`sector-leaders-${s.id}`}>
                  {s.leaders.length ? s.leaders.join(", ") : "Sem subcoordenador definido"}
                </p>
              </div>
              {me.sector_ids.includes(s.id) && <p className="mt-3 text-xs font-semibold text-amber-700">Seu setor</p>}
              {isCoord && (
                <div className="mt-4 flex gap-2 border-t border-amber-900/10 pt-3">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setFormOpen(true); }} data-testid={`sector-edit-btn-${s.id}`}>
                    <Pencil className="size-4" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => setDeleting(s)}
                    data-testid={`sector-delete-btn-${s.id}`}>
                    <Trash2 className="size-4" /> Excluir
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {isCoord && <SectorFormDialog open={formOpen} onOpenChange={setFormOpen} sector={editing} />}

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent data-testid="sector-delete-dialog">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Excluir setor?</DialogTitle>
            <DialogDescription>
              Os membros de “{deleting?.name}” ficarão sem setor e os eventos do setor passam a ser de toda a pastoral.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} data-testid="sector-delete-cancel-button">Cancelar</Button>
            <Button variant="destructive" disabled={del.isPending} onClick={() => deleting && del.mutate(deleting.id)} data-testid="sector-delete-confirm-button">
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
