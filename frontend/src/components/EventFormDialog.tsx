import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiPost, apiPut } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import type { EventIn, EventItem, EventRoleIn, SectorOption } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  event: EventItem | null;
  sectors: SectorOption[];
  defaultDate: string;
}

function initial(event: EventItem | null, defaultDate: string): EventIn {
  if (!event)
    return { event_type: "Encontro", color: "#15803d", title: "", description: "", date: defaultDate, time: "19:00", location: "", sector_id: null, escala_open: true, slots: null, roles: [] };
  const { title, description, date, time, location, sector_id, escala_open, slots, roles } = event;
  return {
    title, description, date, time, location, sector_id, escala_open, slots, event_type: event.event_type, color: event.color,
    roles: roles.map((r) => ({ id: r.id, name: r.name, slots: r.slots })),
  };
}

const SUGGESTED = ["Leitura", "Acolhida", "Canto", "Ministros", "Coleta"];

function EventForm({ event, sectors, defaultDate, onDone }: Omit<Props, "open" | "onOpenChange"> & { onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<EventIn>(() => initial(event, defaultDate));
  const setRole = (i: number, role: EventRoleIn) => setForm((f) => ({ ...f, roles: f.roles.map((r, j) => (j === i ? role : r)) }));
  const addRole = (name: string) => setForm((f) => ({ ...f, slots: null, roles: [...f.roles, { id: null, name, slots: null }] }));
  const labels: Record<string, string> = { all: "Toda a pastoral" };
  for (const s of sectors) labels[s.id] = s.name;

  const save = useMutation({
    mutationFn: (body: EventIn) => (event ? apiPut<EventItem>(`/events/${event.id}`, body) : apiPost<EventItem>("/events", body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      toast.success(event ? "Evento atualizado" : "Evento criado na agenda");
      onDone();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <form
      className="space-y-4"
      data-testid="event-form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(form);
      }}
    >
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_auto] gap-3 mb-4"><div><Label htmlFor="ev-type">Tipo do evento</Label><Input id="ev-type" required maxLength={60} value={form.event_type} onChange={e=>setForm({...form,event_type:e.target.value})} placeholder="Ex: Missa, formação, encontro" /></div><div><Label htmlFor="ev-color">Cor no calendário</Label><Input id="ev-color" type="color" value={form.color} onChange={e=>setForm({...form,color:e.target.value})} className="w-16" /></div></div>
        <Label htmlFor="ev-title">Título</Label>
        <Input id="ev-title" value={form.title} required placeholder="Ex: Missa da Comunidade"
          onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="event-title-input" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="ev-date">Data</Label>
          <Input id="ev-date" type="date" value={form.date} required
            onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="event-date-input" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ev-time">Horário</Label>
          <Input id="ev-time" type="time" value={form.time}
            onChange={(e) => setForm({ ...form, time: e.target.value })} data-testid="event-time-input" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ev-loc">Local</Label>
        <Input id="ev-loc" value={form.location} placeholder="Ex: Igreja Matriz"
          onChange={(e) => setForm({ ...form, location: e.target.value })} data-testid="event-location-input" />
      </div>
      <div className="space-y-2">
        <Label>Para quem é o evento?</Label>
        <Select value={form.sector_id ?? "all"} onValueChange={(v) => setForm({ ...form, sector_id: v === "all" ? null : v })}>
          <SelectTrigger className="w-full" data-testid="event-sector-select">
            <SelectValue>{(v) => labels[v as string] ?? "Toda a pastoral"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda a pastoral</SelectItem>
            {sectors.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ev-desc">Descrição</Label>
        <Textarea id="ev-desc" rows={3} value={form.description} placeholder="Detalhes, o que levar, funções..."
          onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="event-description-input" />
      </div>
      <div className="rounded-xl border border-amber-900/10 bg-amber-50/60 p-3">
        <label className="flex items-center gap-3 text-sm font-semibold text-[#451A03]">
          <Checkbox checked={form.escala_open} onCheckedChange={(c) => setForm({ ...form, escala_open: Boolean(c) })}
            data-testid="event-escala-checkbox" />
          Abrir escala de voluntários
        </label>
        {form.escala_open && (
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-sm font-semibold text-[#451A03]">Funções da escala</p>
              <p className="text-xs text-slate-500">Opcional. Com funções, cada voluntário escolhe onde vai ajudar.</p>
            </div>
            {form.roles.map((r, i) => (
              <div key={r.id ?? `new-${i}`} className="flex items-center gap-2" data-testid={`event-role-row-${i}`}>
                <Input className="flex-1 bg-white" value={r.name} placeholder="Ex: Leitura" required
                  onChange={(e) => setRole(i, { ...r, name: e.target.value })} data-testid={`event-role-name-input-${i}`} />
                <Input type="number" min={1} className="w-24 bg-white" value={r.slots ?? ""} placeholder="vagas"
                  onChange={(e) => setRole(i, { ...r, slots: e.target.value ? Number(e.target.value) : null })}
                  data-testid={`event-role-slots-input-${i}`} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remover função"
                  onClick={() => setForm({ ...form, roles: form.roles.filter((_, j) => j !== i) })} data-testid={`event-role-remove-${i}`}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED.filter((n) => !form.roles.some((r) => r.name === n)).map((n) => (
                <button key={n} type="button" onClick={() => addRole(n)} data-testid={`event-role-suggest-${n}`}
                  className="rounded-full border border-dashed border-amber-400 bg-white px-2.5 py-1 text-xs font-semibold text-[#78350F] transition-colors duration-150 hover:bg-amber-100">
                  + {n}
                </button>
              ))}
              <button type="button" onClick={() => addRole("")} data-testid="event-role-add-btn"
                className="inline-flex items-center gap-1 rounded-full border border-amber-600 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-[#78350F] transition-colors duration-150 hover:bg-amber-200">
                <Plus className="size-3" /> Outra função
              </button>
            </div>
            {form.roles.length === 0 && (
              <div className="flex items-center gap-3 border-t border-amber-900/10 pt-3">
                <Label htmlFor="ev-slots" className="text-sm text-slate-600">Limite de vagas (opcional)</Label>
                <Input id="ev-slots" type="number" min={1} className="w-24 bg-white" value={form.slots ?? ""}
                  onChange={(e) => setForm({ ...form, slots: e.target.value ? Number(e.target.value) : null })}
                  data-testid="event-slots-input" />
              </div>
            )}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} data-testid="event-form-cancel-button">Cancelar</Button>
        <Button type="submit" disabled={save.isPending} data-testid="event-form-submit-button">
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          {event ? "Salvar alterações" : "Criar evento"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function EventFormDialog({ open, onOpenChange, event, sectors, defaultDate }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="event-form-dialog">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">{event ? "Editar evento" : "Novo evento"}</DialogTitle>
          <DialogDescription>O evento aparece na agenda de todos os membros.</DialogDescription>
        </DialogHeader>
        {open && (
          <EventForm key={event?.id ?? "new"} event={event} sectors={sectors} defaultDate={defaultDate} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
