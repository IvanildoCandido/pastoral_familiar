import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { EventItem } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  month: Date;
  onMonthChange: (d: Date) => void;
  events: EventItem[];
  selected: string | null;
  onSelect: (iso: string | null) => void;
  today: string;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function MonthCalendar({ month, onMonthChange, events, selected, onSelect, today }: Props) {
  const start = startOfWeek(startOfMonth(month));
  const end = endOfWeek(endOfMonth(month));
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const byDay: Record<string, EventItem[]> = {};
  for (const e of events) (byDay[e.date] ??= []).push(e);
  const title = format(month, "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="rounded-2xl border border-amber-900/10 bg-white p-3 shadow-[0_4px_20px_-4px_rgba(69,26,3,0.06)] sm:p-5" data-testid="month-calendar">
      <div className="mb-4 flex items-center justify-between">
        <button type="button" aria-label="Mês anterior" onClick={() => onMonthChange(addMonths(month, -1))}
          className="rounded-full p-2 text-[#78350F] transition-colors duration-200 hover:bg-amber-100" data-testid="calendar-prev-month">
          <ChevronLeft className="size-5" />
        </button>
        <h2 className="font-serif text-xl font-semibold text-slate-900 first-letter:uppercase" data-testid="calendar-month-title">{title}</h2>
        <button type="button" aria-label="Próximo mês" onClick={() => onMonthChange(addMonths(month, 1))}
          className="rounded-full p-2 text-[#78350F] transition-colors duration-200 hover:bg-amber-100" data-testid="calendar-next-month">
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((d) => {
          const iso = format(d, "yyyy-MM-dd");
          const list = byDay[iso] ?? [];
          const inMonth = isSameMonth(d, month);
          const isSel = selected === iso;
          return (
            <button key={iso} type="button" onClick={() => onSelect(isSel ? null : iso)} data-testid={`calendar-day-${iso}`}
              className={cn(
                "flex min-h-14 flex-col items-stretch rounded-xl border p-1 text-left transition-colors duration-150 sm:min-h-24 sm:p-1.5",
                inMonth ? "bg-[#FDFCFA]" : "bg-transparent opacity-40",
                isSel ? "border-amber-600 ring-2 ring-amber-500/40" : "border-transparent hover:border-amber-200 hover:bg-amber-50",
              )}>
              <span className={cn("grid size-6 place-items-center self-center rounded-full text-xs font-semibold sm:self-start",
                iso === today ? "bg-[#B45309] text-white" : "text-slate-700")}>
                {format(d, "d")}
              </span>
              {list.length > 0 && (
                <>
                  <span className="mt-1 flex justify-center gap-0.5 sm:hidden">
                    {list.slice(0, 3).map((e) => (
                      <span key={e.id} title={`${e.event_type}: ${e.title}`} style={{backgroundColor:e.color}} className="size-1.5 rounded-full" />
                    ))}
                  </span>
                  <span className="mt-1 hidden space-y-0.5 sm:block">
                    {list.slice(0, 2).map((e) => (
                      <span key={e.id} title={`${e.event_type}: ${e.title}`} style={{backgroundColor:`${e.color}20`,color:"#1e293b",borderLeft:`3px solid ${e.color}`}} className="block truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold">
                        {e.time ? `${e.time} ` : ""}{e.title}
                      </span>
                    ))}
                    {list.length > 2 && <span className="block px-1 text-[10px] text-slate-500">+{list.length - 2} mais</span>}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
