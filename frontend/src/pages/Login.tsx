import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { errorMessage } from "@/lib/format";
import type { LoginIn, User } from "@/lib/types";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState<LoginIn>({ username: "", password: "" });
  const [error, setError] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: (body: LoginIn) => apiPost<User>("/auth/login", body),
    onSuccess: (user) => {
      beginSession();
      toast.success(`Bem-vindo(a), ${user.name.split(" ")[0]}!`);
      navigate("/", { replace: true });
    },
    onError: (err) => setError(errorMessage(err, "Não foi possível entrar.")),
  });

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Acesse a agenda e as escalas da pastoral."
      quote="“Cada um ponha a serviço dos outros o dom que recebeu.” — 1Pd 4,10"
    >
      <form
        className="space-y-5"
        data-testid="login-form"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          login.mutate(form);
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="username">Usuário</Label>
          <Input
            id="username"
            autoComplete="username"
            autoCapitalize="none"
            className="h-11 bg-white"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            data-testid="login-username-input"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            className="h-11 bg-white"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            data-testid="login-password-input"
            required
          />
        </div>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="login-error">
            {error}
          </p>
        )}
        <Button
          type="submit"
          className="h-11 w-full text-base transition-transform duration-100 active:scale-[0.98]"
          disabled={login.isPending}
          data-testid="login-submit-button"
        >
          {login.isPending && <Loader2 className="size-4 animate-spin" />}
          Entrar
        </Button>
      </form>
      <p className="mt-8 text-sm text-slate-600">
        Ainda não tem acesso?{" "}
        <Link to="/solicitar-acesso" className="font-semibold text-[#9A3412] hover:underline" data-testid="go-signup-link">
          Solicitar cadastro
        </Link>
      </p>
    </AuthLayout>
  );
}
