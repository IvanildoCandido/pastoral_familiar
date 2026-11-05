import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPost, apiPut } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import type { Sector, SectorIn } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sector: Sector | null;
}

function SectorForm({ sector, onDone }: { sector: Sector | null; onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<SectorIn>({ name: sector?.name ?? "", description: sector?.description ?? "" });
  const save = useMutation({
    mutationFn: (body: SectorIn) => (sector ? apiPut<Sector>(`/sectors/${sector.id}`, body) : apiPost<Sector>("/sectors", body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sectors"] });
      qc.invalidateQueries({ queryKey: ["sector-options"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      toast.success(sector ? "Setor atualizado" : "Setor criado");
      onDone();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <form className="space-y-4" data-testid="sector-form" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
      <div className="space-y-2">
        <Label htmlFor="sec-name">Nome do setor</Label>
        <Input id="sec-name" value={form.name} required placeholder="Ex: Liturgia"
          onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="sector-name-input" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sec-desc">Descrição</Label>
        <Textarea id="sec-desc" rows={3} value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="sector-description-input" />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} data-testid="sector-form-cancel-button">Cancelar</Button>
        <Button type="submit" disabled={save.isPending} data-testid="sector-form-submit-button">
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          {sector ? "Salvar" : "Criar setor"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function SectorFormDialog({ open, onOpenChange, sector }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="sector-form-dialog">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">{sector ? "Editar setor" : "Novo setor"}</DialogTitle>
        </DialogHeader>
        {open && <SectorForm key={sector?.id ?? "new"} sector={sector} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
