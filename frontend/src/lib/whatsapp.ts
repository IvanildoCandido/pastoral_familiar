import { fmtDate } from "@/lib/format";
import type { EventItem } from "@/lib/types";

export function escalaMessage(ev: EventItem): string {
  const lines: string[] = [];
  lines.push(`🙏 *${ev.title}*`);
  lines.push(`📅 ${fmtDate(ev.date, "EEEE, d 'de' MMMM")}${ev.time ? ` às ${ev.time}` : ""}`);
  if (ev.location) lines.push(`📍 ${ev.location}`);
  if (ev.sector_name) lines.push(`👥 Setor: ${ev.sector_name}`);
  lines.push("");
  lines.push("*Escala de voluntários:*");
  let missing = false;
  if (ev.roles.length > 0) {
    for (const r of ev.roles) {
      const names = ev.helpers.filter((h) => h.role_id === r.id).map((h) => h.name);
      if (!r.slots || names.length < r.slots) missing = true;
      lines.push(`• *${r.name}*${r.slots ? ` (${names.length}/${r.slots})` : ""}: ${names.length ? names.join(", ") : "—"}`);
    }
    const noRole = ev.helpers.filter((h) => !h.role_id).map((h) => h.name);
    if (noRole.length) lines.push(`• *Outros*: ${noRole.join(", ")}`);
  } else {
    const names = ev.helpers.map((h) => h.name);
    if (!ev.slots || names.length < ev.slots) missing = true;
    lines.push(names.length ? names.map((n) => `✅ ${n}`).join("\n") : "Ninguém confirmou ainda.");
    if (ev.slots) lines.push(`(${names.length}/${ev.slots} vagas)`);
  }
  lines.push("");
  if (missing) lines.push("Ainda precisamos de ajuda! Confirme sua participação no app:");
  else lines.push("Escala completa, obrigado a todos! Agenda no app:");
  lines.push(window.location.origin);
  return lines.join("\n");
}

export async function shareOnWhatsApp(ev: EventItem): Promise<boolean> {
  const text = escalaMessage(ev);
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    copied = false;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  return copied;
}
