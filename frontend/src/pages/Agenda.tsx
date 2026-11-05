import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarDays, CalendarHeart, HandHeart, List, Plus, Sparkles } from "lucide-react";
import EventCard from "@/components/EventCard";
import EventFormDialog from "@/components/EventFormDialog";
import AttendanceDialog from "@/components/AttendanceDialog";
import MonthCalendar from "@/components/MonthCalendar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiDelete, apiGet } from "@/lib/api";
import { errorMessage, fmtDate } from "@/lib/format";
import { useMe, useSectors } from "@/hooks/useMe";
import type { EventItem, MessageOut } from "@/lib/types";
import { cn } from "@/lib/utils";

const HERO_IMG =
  "https://images.unsplash.com/photo-1442504028989-ab58b5f29a4a?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=85&w=1600";

type Filter = "all" | "mine" | "open";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "mine", label: "Meus setores" },
  { id: "open", label: "Escala aberta" },
];

const localToday = () => format(new Date(), "yyyy-MM-dd");

export default function Agenda() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const isCoord = me?.role === "coordenador";
  const [view, setView] = useState<"list" | "calendar">("list");
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const [filter, setFilter] = useState<Filter>("all");
  const [month, setMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [deleting, setDeleting] = useState<EventItem | null>(null);
  const [attending, setAttending] = useState<EventItem | null>(null);
  const ym = format(month, "yyyy-MM");

  const events = useQuery({
    queryKey: ["events", scope],
    queryFn: () => apiGet<EventItem[]>(`/events?scope=${scope}`),
    enabled: !!me,
  });
  const upcomingQ = useQuery({
    queryKey: ["events", "upcoming"],
    queryFn: () => apiGet<EventItem[]>("/events?scope=upcoming"),
    enabled: !!me,
  });
  const monthQ = useQuery({
    queryKey: ["events", "month", ym],
    queryFn: () => apiGet<EventItem[]>(`/events?month=${ym}`),
    enabled: !!me && view === "calendar",
  });
  const sectors = useSectors(!!me);

  const del = useMutation({
    mutationFn: (id: string) => apiDelete<MessageOut>(`/events/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      toast.success("Evento removido");
      setDeleting(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const mySectors = me?.sector_ids ?? [];
  const applyFilter = (all: EventItem[]) => {
    if (filter === "mine") return all.filter((e) => !e.sector_id || mySectors.includes(e.sector_id));
    if (filter === "open") return all.filter((e) => e.escala_open);
    return all;
  };
  const list = useMemo(
    () => applyFilter(events.isError ? [] : (events.data ?? [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events.data, events.isError, filter, mySectors.join()],
  );
  const monthEvents = applyFilter(monthQ.isError ? [] : (monthQ.data ?? []));
  const dayList = selectedDay ? monthEvents.filter((e) => e.date === selectedDay) : monthEvents;

  const upcoming = upcomingQ.isError ? [] : (upcomingQ.data ?? []);
  const next = upcoming[0];
  const myEscalas = upcoming.filter((e) => e.my_response === "going");
  const needHelp = upcoming.filter((e) => e.escala_open && e.can_respond && !e.my_response);
  const sectorOptions = (sectors.data ?? []).map((s) => ({ id: s.id, name: s.name }));

  const renderCards = (items: EventItem[]) => (
    <div className="space-y-4" data-testid="events-list">
      {items.map((e, i) => (
        <EventCard key={e.id} event={e} index={i} isCoord={isCoord}
          onEdit={(ev) => { setEditing(ev); setFormOpen(true); }} onDelete={setDeleting} onAttendance={setAttending} />
      ))}
    </div>
  );
  const empty = (msg: string) => (
    <div className="rounded-2xl border border-dashed border-amber-900/20 bg-white/60 p-10 text-center" data-testid="events-empty">
      <CalendarHeart className="mx-auto size-10 text-amber-600" />
      <p className="mt-3 font-serif text-xl text-slate-800">{msg}</p>
    </div>
  );
  const skeleton = (
    <div className="space-y-4" data-testid="events-loading">
      {[0, 1, 2].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-amber-100/50" />)}
    </div>
  );

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-[#2A1810] text-amber-50 shadow-[0_20px_50px_-20px_rgba(42,24,16,0.6)]" data-testid="agenda-hero">
        <img src={HERO_IMG} alt="" className="absolute inset-0 size-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#2A1810] via-[#2A1810]/85 to-[#2A1810]/30" />
        <div className="relative grid gap-6 p-6 sm:p-10 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div className="animate-rise">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Agenda da pastoral</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight sm:text-5xl" data-testid="agenda-greeting">
              Paz e bem{me ? `, ${me.name.split(" ")[0]}` : ""}!
            </h1>
            <p className="mt-3 max-w-lg text-[#D5C4A1]">
              Veja os próximos encontros e coloque seu nome na escala de quem vai ajudar.
            </p>
            {isCoord && (
              <Button
                className="mt-6 h-11 rounded-full bg-amber-400 px-5 text-[#2A1810] transition-transform duration-100 hover:bg-amber-300 active:scale-95"
                onClick={() => { setEditing(null); setFormOpen(true); }}
                data-testid="event-create-btn"
              >
                <Plus className="size-4" /> Novo evento
              </Button>
            )}
          </div>
          {next && (
            <div className="rounded-2xl border border-amber-100/15 bg-amber-50/10 p-5 backdrop-blur-md" data-testid="next-event-highlight">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Próximo evento</p>
              <p className="mt-2 font-serif text-2xl font-semibold">{next.title}</p>
              <p className="mt-1 text-sm text-[#D5C4A1]">
                {fmtDate(next.date, "EEEE, dd/MM")}{next.time ? ` às ${next.time}` : ""}{next.location ? ` · ${next.location}` : ""}
              </p>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-12">
        <section className="space-y-4 lg:col-span-8">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full border border-amber-900/10 bg-white p-1" data-testid="agenda-view-toggle">
              <button type="button" onClick={() => setView("list")} data-testid="agenda-view-list" aria-label="Lista"
                className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors duration-200",
                  view === "list" ? "bg-[#451A03] text-amber-50" : "text-[#78350F] hover:bg-amber-50")}>
                <List className="size-4" /> Lista
              </button>
              <button type="button" onClick={() => setView("calendar")} data-testid="agenda-view-calendar" aria-label="Calendário"
                className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors duration-200",
                  view === "calendar" ? "bg-[#451A03] text-amber-50" : "text-[#78350F] hover:bg-amber-50")}>
                <CalendarDays className="size-4" /> Calendário
              </button>
            </div>
            {view === "list" && (
              <div className="inline-flex rounded-full border border-amber-900/10 bg-white p-1" data-testid="agenda-scope-toggle">
                {(["upcoming", "past"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setScope(s)} data-testid={`agenda-scope-${s}`}
                    className={cn("rounded-full px-3 py-1.5 text-sm font-semibold transition-colors duration-200",
                      scope === s ? "bg-amber-100 text-[#78350F]" : "text-slate-600 hover:bg-amber-50")}>
                    {s === "upcoming" ? "Próximos" : "Anteriores"}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 sm:ml-auto" data-testid="agenda-filters">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" onClick={() => setFilter(f.id)} data-testid={`agenda-filter-${f.id}`}
                  className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-200",
                    filter === f.id ? "border-amber-700 bg-amber-100 text-[#78350F]" : "border-slate-200 text-slate-600 hover:bg-white")}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {view === "list" ? (
            events.isLoading || !me ? skeleton
              : list.length === 0 ? empty(events.isError ? "Não foi possível carregar a agenda agora." : "Nenhum evento por aqui.")
              : renderCards(list)
          ) : (
            <div className="space-y-4">
              <MonthCalendar month={month} onMonthChange={(d) => { setMonth(d); setSelectedDay(null); }}
                events={monthEvents} selected={selectedDay} onSelect={setSelectedDay} today={localToday()} />
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700" data-testid="calendar-selection-label">
                  {selectedDay ? fmtDate(selectedDay, "EEEE, d 'de' MMMM") : "Todos os eventos do mês"}
                </p>
                {selectedDay && (
                  <button type="button" onClick={() => setSelectedDay(null)} className="text-xs font-semibold text-[#9A3412] hover:underline" data-testid="calendar-clear-day">
                    Ver o mês inteiro
                  </button>
                )}
              </div>
              {monthQ.isLoading || !me ? skeleton
                : dayList.length === 0 ? empty(selectedDay ? "Nenhum evento neste dia." : "Nenhum evento neste mês.")
                : renderCards(dayList)}
            </div>
          )}
        </section>

        <aside className="space-y-5 lg:col-span-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-amber-900/10 bg-white p-4" data-testid="stat-my-escalas">
              <HandHeart className="size-5 text-green-700" />
              <p className="mt-2 font-serif text-3xl font-semibold text-slate-900">{myEscalas.length}</p>
              <p className="text-xs font-semibold text-slate-500">Minhas escalas</p>
            </div>
            <div className="rounded-2xl border border-amber-900/10 bg-white p-4" data-testid="stat-need-help">
              <Sparkles className="size-5 text-amber-600" />
              <p className="mt-2 font-serif text-3xl font-semibold text-slate-900">{needHelp.length}</p>
              <p className="text-xs font-semibold text-slate-500">Aguardam sua resposta</p>
            </div>
          </div>

          {me && (
            <div className="rounded-2xl bg-gradient-to-br from-[#451A03] to-[#78350F] p-5 text-amber-50" data-testid="stat-my-service">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Sua caminhada</p>
              <p className="mt-2 font-serif text-2xl font-semibold">
                Você já serviu {me.served_count} {me.served_count === 1 ? "vez" : "vezes"}
              </p>
              <p className="mt-1 text-sm text-amber-100/80">
                {me.last_served ? `Última vez em ${fmtDate(me.last_served, "dd/MM/yyyy")}. Obrigado!` : "Que tal se inscrever na próxima escala?"}
              </p>
            </div>
          )}

          {myEscalas.length > 0 && (
            <div className="rounded-2xl border border-green-200 bg-[#F0FDF4] p-5" data-testid="my-escalas-list">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-green-800">Você vai ajudar em</p>
              <ul className="mt-3 space-y-2">
                {myEscalas.map((e) => {
                  const role = e.roles.find((r) => r.id === e.my_role_id);
                  return (
                    <li key={e.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-semibold text-slate-800">{e.title}{role && <span className="font-normal text-green-800"> · {role.name}</span>}</span>
                      <span className="shrink-0 text-green-800">{fmtDate(e.date, "dd/MM")}{e.time ? ` ${e.time}` : ""}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="rounded-2xl border border-amber-900/10 bg-white p-5" data-testid="sidebar-sectors">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Setores</p>
              <Link to="/setores" className="text-xs font-semibold text-[#9A3412] hover:underline" data-testid="sidebar-sectors-link">Ver todos</Link>
            </div>
            <ul className="mt-3 divide-y divide-amber-900/5">
              {(sectors.isError ? [] : (sectors.data ?? [])).map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <span className={cn("font-medium text-slate-800", mySectors.includes(s.id) && "text-[#9A3412]")}>
                    {s.name}{mySectors.includes(s.id) ? " · seu setor" : ""}
                  </span>
                  <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-xs font-semibold text-[#78350F]">{s.member_count}</span>
                </li>
              ))}
              {(sectors.data ?? []).length === 0 && <li className="py-2 text-sm text-slate-500">Nenhum setor cadastrado.</li>}
            </ul>
          </div>
        </aside>
      </div>

      {isCoord && (
        <EventFormDialog open={formOpen} onOpenChange={setFormOpen} event={editing} sectors={sectorOptions}
          defaultDate={selectedDay ?? localToday()} />
      )}
      <AttendanceDialog event={attending} onOpenChange={(o) => !o && setAttending(null)} />

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent data-testid="event-delete-dialog">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Excluir evento?</DialogTitle>
            <DialogDescription>“{deleting?.title}”, sua escala e as presenças serão removidos.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} data-testid="event-delete-cancel-button">Cancelar</Button>
            <Button variant="destructive" disabled={del.isPending} onClick={() => deleting && del.mutate(deleting.id)} data-testid="event-delete-confirm-button">
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
