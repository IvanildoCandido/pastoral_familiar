import { useBranding, BrandLogo } from "@/components/Branding";
import type { ReactNode } from "react";


const IMG =
  "https://images.unsplash.com/photo-1569292567773-229e2b7521ee?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=85&w=1400";

export default function AuthLayout({
  title,
  subtitle,
  quote,
  children,
}: {
  title: string;
  subtitle: string;
  quote: string;
  children: ReactNode;
}) {
  const branding = useBranding();
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#2A1810] lg:block">
        <img src={branding.data?.hero_url || IMG} alt="Comunidade paroquial" className="absolute inset-0 size-full object-cover opacity-45" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#2A1810] via-[#2A1810]/60 to-transparent" />
        <div className="relative flex h-full flex-col justify-between p-12 text-amber-50">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-amber-100/15 ring-1 ring-amber-100/25 backdrop-blur">
              <BrandLogo />
            </span>
            <span className="font-serif text-2xl font-semibold">Pastoral Familiar</span>
          </div>
          <div className="max-w-md animate-rise">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Servir com alegria</p>
            <blockquote className="mt-4 font-serif text-3xl leading-snug text-amber-50">{quote}</blockquote>
          </div>
        </div>
      </aside>
      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md animate-rise">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-[#451A03] text-amber-100">
              <BrandLogo />
            </span>
            <span className="font-serif text-xl font-semibold text-[#451A03]">Pastoral Familiar</span>
          </div>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-2 text-slate-600">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </div>
  );
}
