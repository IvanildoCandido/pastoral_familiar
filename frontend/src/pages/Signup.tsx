import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import SectorChecklist from "@/components/SectorChecklist";
import { apiPost } from "@/lib/api";
import { errorMessage, maskPhone } from "@/lib/format";
import { useSectorOptions } from "@/hooks/useMe";
import type { MessageOut, SignupIn } from "@/lib/types";

const EMPTY: SignupIn = { username: "", password: "", name: "", phone: "", sector_ids: [], notes: "" };

export default function Signup() {
  const [form, setForm] = useState<SignupIn>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const sectors = useSectorOptions();

  const signup = useMutation({
    mutationFn: (body: SignupIn) => apiPost<MessageOut>("/auth/signup", body),
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <AuthLayout
      title="Solicitar cadastro"
      subtitle="Preencha seus dados. A coordenação vai aprovar seu acesso."
      quote="“Onde dois ou três estiverem reunidos em meu nome, eu estou ali.” — Mt 18,20"
    >
      {signup.isSuccess ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6" data-testid="signup-success">
          <CheckCircle2 className="size-8 text-green-700" />
          <h2 className="mt-3 font-serif text-xl font-semibold text-green-900">Cadastro enviado!</h2>
          <p className="mt-1 text-sm text-green-800">{signup.data.message}</p>
          <Link to="/login" className="mt-4 inline-block font-semibold text-[#9A3412] hover:underline" data-testid="signup-back-login-link">
            Voltar para o login
          </Link>
        </div>
      ) : (
        <form
          className="space-y-4"
          data-testid="signup-form"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            signup.mutate(form);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="s-name">Nome completo</Label>
            <Input id="s-name" className="h-11 bg-white" value={form.name} required
              onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="signup-name-input" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-phone">Telefone / WhatsApp</Label>
            <Input id="s-phone" inputMode="tel" className="h-11 bg-white" placeholder="(11) 99999-9999" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })} data-testid="signup-phone-input" />
          </div>
          <div className="space-y-2">
            <Label>Setores em que deseja servir</Label>
            <SectorChecklist sectors={sectors.data ?? []} value={form.sector_ids}
              onChange={(ids) => setForm({ ...form, sector_ids: ids })} testid="signup-sectors-checklist" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="s-user">Usuário</Label>
              <Input id="s-user" autoCapitalize="none" className="h-11 bg-white" value={form.username} required
                placeholder="ex: maria.silva"
                onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, "") })} data-testid="signup-username-input" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-pass">Senha</Label>
              <Input id="s-pass" type="password" className="h-11 bg-white" value={form.password} required minLength={6}
                placeholder="mín. 6 caracteres"
                onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="signup-password-input" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-notes">Observação (opcional)</Label>
            <Textarea id="s-notes" className="bg-white" rows={3} value={form.notes} placeholder="Como gostaria de ajudar?"
              onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="signup-notes-input" />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="signup-error">{error}</p>}
          <Button type="submit" className="h-11 w-full text-base transition-transform duration-100 active:scale-[0.98]"
            disabled={signup.isPending} data-testid="signup-submit-button">
            {signup.isPending && <Loader2 className="size-4 animate-spin" />}
            Enviar cadastro
          </Button>
          <p className="text-sm text-slate-600">
            Já tem acesso?{" "}
            <Link to="/login" className="font-semibold text-[#9A3412] hover:underline" data-testid="go-login-link">Entrar</Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
