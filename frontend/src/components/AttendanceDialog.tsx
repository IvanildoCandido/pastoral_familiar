import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiPut } from "@/lib/api";
import { errorMessage, fmtDate } from "@/lib/format";
import type { AttendanceIn, EventItem, Helper } from "@/lib/types";

interface Props {
  event: EventItem | null;
  onOpenChange: (o: boolean) => void;
}

const STATUS: Record<string, string> = { going: "disse que ia", not_going: "disse que não ia", pending: "não respondeu" };

function AttendanceForm({ event, onDone }: { event: EventItem; onDone: () => void }) {
  const qc = useQueryClient();
  const people: (Helper & { status: string })[] = [
    ...event.helpers.map((h) => ({ ...h, status: "going" })),
    ...event.declined.map((h) => ({ ...h, status: "not_going" })),
    ...event.pending.map((h) => ({ ...h, status: "pending" })),
  ];
  const [present, setPresent] = useState<Set<string>>(
    () => new Set(event.attendance.length ? event.attendance : event.helpers.map((h) => h.user_id)),
  );
  const toggle = (id: string, on: boolean) =>
    setPresent((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const save = useMutation({
    mutationFn: (body: AttendanceIn) => apiPut<EventItem>(`/events/${event.id}/attendance`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Presenças registradas");
      onDone();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <div className="max-h-[55vh] space-y-1 overflow-y-auto pr-1" data-testid="attendance-list">
        {people.length === 0 && <p className="text-sm text-slate-500">Nenhum membro elegível para este evento.</p>}
        {people.map((p) => (
          <label key={p.user_id} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-amber-50"
            data-testid={`attendance-row-${p.user_id}`}>
            <Checkbox checked={present.has(p.user_id)} onCheckedChange={(c) => toggle(p.user_id, Boolean(c))}
              data-testid={`attendance-checkbox-${p.user_id}`} />
            <span className="flex-1 text-sm font-medium text-slate-800">{p.name}</span>
            <span className="text-xs text-slate-500">
              {p.role_name ? `${p.role_name} · ` : ""}{STATUS[p.status]}
            </span>
          </label>
        ))}
      </div>
      <DialogFooter>
        <span className="mr-auto self-center text-sm text-slate-600" data-testid="attendance-count">{present.size} presente(s)</span>
        <Button variant="outline" onClick={onDone} data-testid="attendance-cancel-button">Cancelar</Button>
        <Button disabled={save.isPending} onClick={() => save.mutate({ present_user_ids: [...present] })} data-testid="attendance-save-button">
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          Salvar presença
        </Button>
      </DialogFooter>
    </>
  );
}

export default function AttendanceDialog({ event, onOpenChange }: Props) {
  return (
    <Dialog open={!!event} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="attendance-dialog">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Quem compareceu?</DialogTitle>
          <DialogDescription>
            {event ? `${event.title} · ${fmtDate(event.date, "dd/MM/yyyy")}` : ""}. A presença confirmada conta no histórico de cada membro.
          </DialogDescription>
        </DialogHeader>
        {event && <AttendanceForm key={event.id} event={event} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
