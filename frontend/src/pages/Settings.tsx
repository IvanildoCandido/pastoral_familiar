import { Navigate } from "react-router-dom";
import { BrandingUpload } from "@/components/Branding";
import { useMe } from "@/hooks/useMe";

export default function Settings() {
  const {data: me} = useMe();

  if (!me) return <div className="h-48 animate-pulse rounded-2xl bg-amber-100/50" aria-label="Carregando configurações" />;
  if (me.role !== "coordenador") return <Navigate to="/" replace />;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Pastoral Familiar</p>
        <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight text-slate-900">Configurações</h1>
        <p className="mt-1 text-slate-600">Cuide da identidade visual da pastoral.</p>
      </div>
      <BrandingUpload />
    </div>
  );
}
