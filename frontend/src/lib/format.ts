import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ApiError } from "@/lib/api";
import type { Role } from "@/lib/types";

export const ROLE_LABELS: Record<Role, string> = {
  coordenador: "Coordenador",
  subcoordenador: "Subcoordenador",
  membro: "Membro",
};

export const ROLE_BADGE: Record<Role, string> = {
  coordenador: "bg-[#E0E7FF] text-[#3730A3]",
  subcoordenador: "bg-[#F3E8FF] text-[#6B21A8]",
  membro: "bg-[#F1F5F9] text-[#334155]",
};

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDate(iso: string, pattern: string): string {
  const out = format(parseDate(iso), pattern, { locale: ptBR });
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export function maskPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function whatsappLink(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  if (d.length < 10) return null;
  return `https://wa.me/${d.length <= 11 ? "55" + d : d}`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function errorMessage(err: unknown, fallback = "Algo deu errado. Tente novamente."): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: unknown } | null;
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) return "Verifique os campos preenchidos.";
  }
  return fallback;
}
