import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarClock, Check, ChevronDown, ClipboardCheck, Clock, HandHeart, MapPin, MessageCircle, Pencil, Phone, Trash2, X,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiDelete, apiPost } from "@/lib/api";
import { errorMessage, fmtDate, whatsappLink } from "@/lib/format";
import { shareOnWhatsApp } from "@/lib/whatsapp";
import type { EventItem, Helper, RsvpIn } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  event: EventItem;
  isCoord: boolean;
  onEdit: (e: EventItem) => void;
  onDelete: (e: EventItem) => void;
  onAttendance: (e: EventItem) => void;
  index: number;
}

const pill = "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-[transform,background-color,color] duration-150 active:scale-95 disabled:opacity-50";

function PersonChip({ h, tone, eventId, present }: { h: Helper; tone: "go" | "no" | "wait"; eventId: string; present?: boolean }) {
  const wa = h.phone ? whatsappLink(h.phone) : null;
  const tones = {
    go: "bg-[#DCFCE7] text-[#166534]",
    no: "bg-slate-100 text-slate-700",
    wait: "bg-amber-50 text-[#78350F] ring-1 ring-amber-200",
  };
  return (
    <li className={cn("inline-flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-sm", tones[tone])}
      data-testid={`event-person-${eventId}-${h.user_id}`}>
      <span className={cn("grid size-6 place-items-center rounded-full text-[10px] font-bold text-white",
        tone === "go" ? "bg-green-700" : tone === "no" ? "bg-slate-500" : "bg-amber-600")}>
        {h.name[0]}
      </span>
      {h.name}
      {h.role_name && <span className="text-xs opacity-75">· {h.role_name}</span>}
      {present && <ClipboardCheck className="size-3.5" aria-label="Presença confirmada" />}
      {wa && (
        <a href={wa} target="_blank" rel="noreferrer" aria-label={`WhatsApp de ${h.name}`} className="opacity-80 hover:opacity-100">
          <Phone className="size-3.5" />
        </a>
      )}
    </li>
  );
}

function Group({ title, people, tone, eventId, attendance, testid }: {
  title: string; people: Helper[]; tone: "go" | "no" | "wait"; eventId: string; attendance: string[]; testid: string;
}) {
  return (
    <div data-testid={testid}>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{title} ({people.length})</p>
      {people.length === 0 ? (
        <p className="text-sm text-slate-400">—</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {people.map((h) => <PersonChip key={h.user_id} h={h} tone={tone} eventId={eventId} present={attendance.includes(h.user_id)} />)}
        </ul>
      )}
    </div>
  );
}

export default function EventCard({ event, isCoord, onEdit, onDelete, onAttendance, index }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const going = event.helpers.length;
  const hasRoles = event.roles.length > 0;
  const totalSlots = hasRoles
    ? event.roles.every((r) => r.slots) ? event.roles.reduce((a, r) => a + (r.slots ?? 0), 0) : null
    : event.slots;
  const full = !hasRoles && event.slots !== null && going >= event.slots && event.my_response !== "going";
  const myRole = event.roles.find((r) => r.id === event.my_role_id);
  const leader = event.can_manage;

  const rsvp = useMutation({
    mutationFn: (body: RsvpIn | null) =>
      body ? apiPost<EventItem>(`/events/${event.id}/rsvp`, body) : apiDelete<EventItem>(`/events/${event.id}/rsvp`),
    onSuccess: (_d, body) => {
      qc.invalidateQueries({ queryKey: ["events"] });
      if (body?.response === "going") toast.success("Obrigado! Você está na escala 🙏");
      else if (body?.response === "not_going") toast("Resposta registrada: não vai poder");
      else toast("Resposta removida");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const share = async () => {
    const copied = await shareOnWhatsApp(event);
    toast.success(copied ? "Mensagem copiada! Escolha o grupo no WhatsApp." : "Abrindo o WhatsApp…");
  };

  const showFooter = event.escala_open || going > 0 || event.can_mark_attendance;
  const goingBtn = (
    <>
      <Check className="size-4" />
      {event.my_response === "going" ? `Vou ajudar${myRole ? ` · ${myRole.name}` : ""} ✓` : full ? "Vagas esgotadas" : "Vou ajudar"}
      {hasRoles && event.my_response !== "going" && <ChevronDown className="size-3.5" />}
    </>
  );
  const goingCls = cn(pill, event.my_response === "going" ? "bg-green-700 text-white shadow-sm" : "bg-[#B45309] text-white hover:bg-[#92400E]");

  return (
    <article
      data-testid={`event-card-${event.id}`}
      style={{ animationDelay: `${index * 60}ms` }}
      className={cn(
        "group animate-rise rounded-2xl border border-amber-900/10 bg-[#FDFCFA] shadow-[0_4px_20px_-4px_rgba(69,26,3,0.06)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none",
        event.is_past && "opacity-90",
      )}
    >
      <div className="flex gap-4 p-4 sm:p-5">
        <div className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-[#2A1810] py-2.5 text-amber-50 sm:w-[72px]">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-amber-400">{fmtDate(event.date, "MMM")}</span>
          <span className="font-serif text-3xl font-semibold leading-none" data-testid={`event-day-${event.id}`}>{fmtDate(event.date, "dd")}</span>
          <span className="mt-1 text-[11px] text-amber-100/80">{fmtDate(event.date, "EEE")}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold",
              event.sector_name ? "bg-[#FEF3C7] text-[#78350F]" : "bg-[#DBEAFE] text-[#1E3A8A]")}
              data-testid={`event-sector-${event.id}`}>
              {event.sector_name ?? "Toda a pastoral"}
            </span>
            {event.escala_open && !event.is_past ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-xs font-semibold text-[#166534]" data-testid={`event-escala-status-${event.id}`}>
                <span className="size-1.5 animate-soft-pulse rounded-full bg-green-600" />
                Escala aberta
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600" data-testid={`event-escala-status-${event.id}`}>
                {event.is_past ? "Realizado" : "Sem escala"}
              </span>
            )}
            {leader && event.attendance.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#E0E7FF] px-2.5 py-0.5 text-xs font-semibold text-[#3730A3]" data-testid={`event-attendance-badge-${event.id}`}>
                <ClipboardCheck className="size-3.5" /> {event.attendance.length} presente(s)
              </span>
            )}
            {isCoord && (
              <span className="ml-auto flex gap-1">
                <button type="button" aria-label="Editar evento" onClick={() => onEdit(event)}
                  className="rounded-lg p-1.5 text-slate-500 transition-colors duration-200 hover:bg-amber-100 hover:text-[#78350F]"
                  data-testid={`event-edit-btn-${event.id}`}>
                  <Pencil className="size-4" />
                </button>
                <button type="button" aria-label="Excluir evento" onClick={() => onDelete(event)}
                  className="rounded-lg p-1.5 text-slate-500 transition-colors duration-200 hover:bg-red-50 hover:text-red-700"
                  data-testid={`event-delete-btn-${event.id}`}>
                  <Trash2 className="size-4" />
                </button>
              </span>
            )}
          </div>

          <h3 className="mt-2 font-serif text-xl font-semibold leading-snug text-slate-900" data-testid={`event-title-${event.id}`}>{event.title}</h3>
          <p className="mt-1 text-xs text-slate-500"><span style={{backgroundColor:event.color}} className="mr-1 inline-block size-2 rounded-full" />{event.event_type} · Criado por {event.created_by_name ?? "usuário removido ou não registrado"}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-4 text-amber-700" />{fmtDate(event.date, "EEEE, d 'de' MMMM")}</span>
            {event.time && <span className="inline-flex items-center gap-1.5" data-testid={`event-time-${event.id}`}><Clock className="size-4 text-amber-700" />{event.time}</span>}
            {event.location && <span className="inline-flex items-center gap-1.5" data-testid={`event-location-${event.id}`}><MapPin className="size-4 text-amber-700" />{event.location}</span>}
          </div>
          {event.description && <p className="mt-2 text-sm leading-relaxed text-slate-700">{event.description}</p>}
          {hasRoles && (
            <div className="mt-3 flex flex-wrap gap-1.5" data-testid={`event-roles-${event.id}`}>
              {event.roles.map((r) => {
                const isFull = r.slots !== null && r.taken >= r.slots;
                return (
                  <span key={r.id} data-testid={`event-role-${event.id}-${r.id}`}
                    className={cn("rounded-lg border px-2.5 py-1 text-xs font-semibold",
                      isFull ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-white text-[#78350F]")}>
                    {r.name} · {r.taken}{r.slots ? `/${r.slots}` : ""}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showFooter && (
        <div className="border-t border-dashed border-amber-900/15 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setOpen((o) => !o)}
              className="mr-auto inline-flex items-center gap-2 text-sm font-semibold text-[#451A03]"
              data-testid={`event-helpers-toggle-${event.id}`}>
              <HandHeart className="size-4 text-amber-700" />
              <span data-testid={`event-helpers-count-${event.id}`}>
                {going}{totalSlots ? `/${totalSlots}` : ""} {going === 1 ? "voluntário" : "voluntários"}
              </span>
              {leader && event.escala_open && !event.is_past && event.pending.length > 0 && (
                <span className="text-xs font-medium text-amber-700">· {event.pending.length} sem resposta</span>
              )}
              <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
            </button>

            {leader && event.escala_open && !event.is_past && (
              <button type="button" onClick={() => void share()} data-testid={`event-whatsapp-share-btn-${event.id}`}
                className={cn(pill, "border border-green-600/30 bg-white px-3 text-green-800 hover:bg-green-50")}>
                <MessageCircle className="size-4" /> <span className="hidden sm:inline">WhatsApp</span>
              </button>
            )}
            {event.can_mark_attendance && (
              <button type="button" onClick={() => onAttendance(event)} data-testid={`event-attendance-btn-${event.id}`}
                className={cn(pill, "border border-indigo-300 bg-white px-3 text-indigo-800 hover:bg-indigo-50")}>
                <ClipboardCheck className="size-4" /> Marcar presença
              </button>
            )}

            {event.escala_open && !event.is_past && (event.can_respond ? (
              <div className="flex gap-2">
                {hasRoles && event.my_response !== "going" ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger disabled={rsvp.isPending} className={goingCls} data-testid={`event-rsvp-going-btn-${event.id}`}>
                      {goingBtn}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-52">
                      <DropdownMenuGroup>
                      <DropdownMenuLabel>Em qual função?</DropdownMenuLabel>
                      {event.roles.map((r) => {
                        const isFull = r.slots !== null && r.taken >= r.slots;
                        return (
                          <DropdownMenuItem key={r.id} disabled={isFull} data-testid={`event-rsvp-role-${event.id}-${r.id}`}
                            onClick={() => rsvp.mutate({ response: "going", role_id: r.id })}>
                            <span className="flex-1">{r.name}</span>
                            <span className="text-xs text-slate-500">
                              {isFull ? "esgotado" : r.slots ? `${r.slots - r.taken} vaga(s)` : "livre"}
                            </span>
                          </DropdownMenuItem>
                        );
                      })}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <button type="button" disabled={rsvp.isPending || full} className={goingCls} data-testid={`event-rsvp-going-btn-${event.id}`}
                    onClick={() => rsvp.mutate(event.my_response === "going" ? null : { response: "going" })}>
                    {goingBtn}
                  </button>
                )}
                <button type="button" disabled={rsvp.isPending} data-testid={`event-rsvp-not-going-btn-${event.id}`}
                  onClick={() => rsvp.mutate(event.my_response === "not_going" ? null : { response: "not_going" })}
                  className={cn(pill, event.my_response === "not_going" ? "border border-slate-700 bg-slate-700 text-white" : "border border-slate-300 text-slate-700 hover:bg-slate-100")}>
                  <X className="size-4" /> Não vou
                </button>
              </div>
            ) : (
              <span className="text-xs text-slate-500" data-testid={`event-sector-only-${event.id}`}>Escala exclusiva do setor {event.sector_name}</span>
            ))}
          </div>

          {open && (
            <div className="mt-4 animate-rise space-y-4" data-testid={`event-helpers-list-${event.id}`}>
              {leader ? (
                <>
                  <Group title="Vão ajudar" people={event.helpers} tone="go" eventId={event.id} attendance={event.attendance} testid={`event-group-going-${event.id}`} />
                  <Group title="Não vão" people={event.declined} tone="no" eventId={event.id} attendance={event.attendance} testid={`event-group-declined-${event.id}`} />
                  {event.escala_open && (
                    <Group title="Não responderam" people={event.pending} tone="wait" eventId={event.id} attendance={event.attendance} testid={`event-group-pending-${event.id}`} />
                  )}
                </>
              ) : going === 0 ? (
                <p className="text-sm text-slate-500">Ninguém confirmou ainda. Seja o primeiro!</p>
              ) : (
                <>
                  <ul className="flex flex-wrap gap-1.5">
                    {event.helpers.map((h) => <PersonChip key={h.user_id} h={h} tone="go" eventId={event.id} />)}
                  </ul>
                  {event.declined_count > 0 && <p className="text-xs text-slate-500">{event.declined_count} pessoa(s) avisaram que não vão poder.</p>}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
