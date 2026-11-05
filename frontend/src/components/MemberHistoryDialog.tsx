import { useQuery } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { HistoryItem, User } from "@/lib/types";

export default function MemberHistoryDialog({ member, onOpenChange }: { member: User | null; onOpenChange: (o: boolean) => void }) {
  const history = useQuery({
    queryKey: ["members", "history", member?.id],
    queryFn: () => apiGet<HistoryItem[]>(`/members/${member?.id}/history`),
    enabled: !!member,
  });
  const items = history.isError ? [] : (history.data ?? []);
  return (
    <Dialog open={!!member} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="member-history-dialog">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">{member?.name}</DialogTitle>
          <DialogDescription>
            Serviu {member?.served_count ?? 0} {member?.served_count === 1 ? "vez" : "vezes"} com presença confirmada.
          </DialogDescription>
        </DialogHeader>
        {history.isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-amber-100/50" />
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500" data-testid="member-history-empty">Ainda não há presenças registradas.</p>
        ) : (
          <ul className="max-h-[55vh] space-y-2 overflow-y-auto" data-testid="member-history-list">
            {items.map((h) => (
              <li key={h.event_id} className="flex items-center gap-3 rounded-xl bg-[#FDFCFA] px-3 py-2.5 ring-1 ring-amber-900/10">
                <CalendarCheck className="size-4 shrink-0 text-green-700" />
                <span className="flex-1 text-sm font-medium text-slate-800">
                  {h.title}
                  {h.role_name && <span className="ml-1.5 text-xs text-amber-700">· {h.role_name}</span>}
                </span>
                <span className="text-xs text-slate-500">{fmtDate(h.date, "dd/MM/yyyy")}</span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
