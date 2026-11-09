import BirthdayFields from "@/components/BirthdayFields";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SectorChecklist from "@/components/SectorChecklist";
import { apiPost, apiPut } from "@/lib/api";
import { ROLE_LABELS, errorMessage, maskPhone } from "@/lib/format";
import type { MemberCreate, MemberUpdate, Role, SectorOption, User } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  member: User | null;
  sectors: SectorOption[];
  isCoord: boolean;
  mySectorIds: string[];
  meId: string | undefined;
}

function MemberForm({ member, sectors, isCoord, mySectorIds, meId, onDone }: Omit<Props, "open" | "onOpenChange"> & { onDone: () => void }) {
  const qc = useQueryClient();
  const isSelf = !!member && member.id === meId;
  // Subcoordinators may only assign their own sectors; other sectors on the member are kept server-side.
  const allowed = isCoord ? sectors : sectors.filter((s) => mySectorIds.includes(s.id));
  const [form, setForm] = useState<MemberCreate>(() => ({
    username: member?.username ?? "",
    password: "",
    name: member?.name ?? "",
    phone: member?.phone ?? "",
    birthday: member?.birthday ?? null, family_members: member?.family_members ?? [],
    notes: member?.notes ?? "",
    role: member?.role ?? "membro",
    coordinated_sector_ids: member?.coordinated_sector_ids ?? [],
    sector_ids: member ? member.sector_ids : isCoord ? [] : [...mySectorIds],
  }));
  const outside = isCoord ? [] : sectors.filter((s) => form.sector_ids.includes(s.id) && !mySectorIds.includes(s.id));

  const save = useMutation({
    mutationFn: () => {
      if (member) {
        const body: MemberUpdate = {
          name: form.name, phone: form.phone, birthday: form.birthday, family_members: form.family_members, notes: form.notes, role: form.role, sector_ids: form.sector_ids, coordinated_sector_ids: form.role === "subcoordenador" ? form.coordinated_sector_ids : [],
          password: form.password ? form.password : null,
        };
        return apiPut<User>(`/members/${member.id}`, body);
      }
      return apiPost<User>("/members", form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["birthdays"] });
      qc.invalidateQueries({ queryKey: ["sectors"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(member ? "Membro atualizado" : "Membro cadastrado");
      onDone();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <form className="space-y-4" data-testid="member-form" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div className="space-y-2">
        <Label htmlFor="m-name">Nome completo</Label>
        <Input id="m-name" value={form.name} required onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="member-name-input" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="m-phone">Telefone / WhatsApp</Label>
        <Input id="m-phone" inputMode="tel" placeholder="(11) 99999-9999" value={form.phone}
          onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })} data-testid="member-phone-input" />
      </div>
      <BirthdayFields value={form} onChange={fields => setForm({ ...form, ...fields })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="m-user">Usuário</Label>
          <Input id="m-user" autoCapitalize="none" value={form.username} required disabled={!!member}
            onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, "") })} data-testid="member-username-input" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="m-pass">{member ? "Nova senha (opcional)" : "Senha"}</Label>
          <Input id="m-pass" type="text" value={form.password} required={!member} minLength={6} placeholder="mín. 6 caracteres"
            onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="member-password-input" />
        </div>
      </div>
      {isCoord && (
        <div className="space-y-2">
          <Label>Função</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
            <SelectTrigger className="w-full" data-testid="member-role-select">
              <SelectValue>{(v) => ROLE_LABELS[v as Role]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {(isCoord || !isSelf) && (
        <div className="space-y-2">
          <Label>Setores</Label>
          <SectorChecklist sectors={allowed} value={form.sector_ids} onChange={(ids) => setForm({ ...form, sector_ids: ids, coordinated_sector_ids: form.coordinated_sector_ids.filter(id => ids.includes(id)) })}
            testid="member-sectors-checklist" />
          {outside.length > 0 && (
            <p className="text-xs text-slate-500">Também participa de: {outside.map((s) => s.name).join(", ")}</p>
          )}
          {!isCoord && <p className="text-xs text-slate-500">Você pode marcar apenas os setores que coordena.</p>}
        </div>
      )}
      <div className="space-y-2">
        {isCoord && form.role === "subcoordenador" && <div className="space-y-2"><Label>Setores que subcoordena</Label><SectorChecklist sectors={sectors.filter(s=>form.sector_ids.includes(s.id))} value={form.coordinated_sector_ids} onChange={ids=>setForm({...form, coordinated_sector_ids:ids})} testid="member-coordinated-sectors" /><p className="text-xs text-slate-500">Nos demais setores selecionados, participa como membro.</p></div>}
        <Label htmlFor="m-notes">Observações</Label>
        <Textarea id="m-notes" rows={3} value={form.notes} placeholder="Disponibilidade, talentos, cuidados..."
          onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="member-notes-input" />
        <p className="text-xs text-slate-500">Visível apenas para coordenação.</p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} data-testid="member-form-cancel-button">Cancelar</Button>
        <Button type="submit" disabled={save.isPending} data-testid="member-form-submit-button">
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          {member ? "Salvar" : "Cadastrar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function MemberFormDialog(props: Props) {
  const { open, onOpenChange, member } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="member-form-dialog">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">{member ? "Editar membro" : "Novo membro"}</DialogTitle>
          <DialogDescription>O membro entra no sistema com o usuário e a senha definidos aqui.</DialogDescription>
        </DialogHeader>
        {open && <MemberForm key={member?.id ?? "new"} {...props} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
