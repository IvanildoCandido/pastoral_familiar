import { BrandLogo } from "@/components/Branding";
import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronDown, LayoutGrid, LogOut, Settings, Users } from "lucide-react";
import { ApiError, apiGet } from "@/lib/api";
import { endSession } from "@/lib/session";
import { isLeader, useMe } from "@/hooks/useMe";
import { ROLE_BADGE, ROLE_LABELS, initials } from "@/lib/format";
import type { User } from "@/lib/types";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const linkBase =
  "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200";

function NavItems({ leader, pending, mobile }: { leader: boolean; pending: number; mobile?: boolean }) {
  const items = [
    { to: "/", label: "Agenda", icon: CalendarDays, id: "agenda", show: true },
    { to: "/membros", label: "Membros", icon: Users, id: "membros", show: leader },
    { to: "/setores", label: "Setores", icon: LayoutGrid, id: "setores", show: true },
  ].filter((i) => i.show);
  return (
    <>
      {items.map(({ to, label, icon: Icon, id }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          data-testid={`${mobile ? "mobile-" : ""}nav-${id}-link`}
          className={({ isActive }) =>
            mobile
              ? cn(
                  "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-semibold transition-colors duration-200",
                  isActive ? "text-primary" : "text-slate-500",
                )
              : cn(linkBase, isActive ? "bg-[#451A03] text-amber-50" : "text-[#78350F] hover:bg-amber-100/70")
          }
        >
          <span className="relative">
            <Icon className="size-4" />
            {id === "membros" && pending > 0 && (
              <span
                data-testid={`${mobile ? "mobile-" : ""}nav-pending-count`}
                className="absolute -top-2 -right-2.5 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] leading-4 text-white"
              >
                {pending}
              </span>
            )}
          </span>
          {label}
        </NavLink>
      ))}
    </>
  );
}

export default function AppShell() {
  const navigate = useNavigate();
  const me = useMe();
  const user = me.data;
  const leader = isLeader(user);
  const pendingQ = useQuery({
    queryKey: ["members", "pending"],
    queryFn: () => apiGet<User[]>("/members?status=pending"),
    enabled: leader,
  });

  if (me.error instanceof ApiError && me.error.status === 401) {
    return <Navigate to="/login" replace />;
  }

  const pending = leader ? (pendingQ.data?.length ?? 0) : 0;

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-amber-900/10 bg-amber-50/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2.5" data-testid="brand-home-link">
            <span className="grid size-9 place-items-center rounded-xl bg-[#451A03] text-amber-100 shadow-sm">
              <BrandLogo />
            </span>
            <span className="leading-tight">
              <span className="block font-serif text-lg font-semibold text-[#451A03]">Pastoral Familiar</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                Agenda & Escalas
              </span>
            </span>
          </NavLink>
          <nav className="ml-6 hidden items-center gap-1 md:flex" data-testid="desktop-nav">
            <NavItems leader={leader} pending={pending} />
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Abrir menu do perfil"
                  data-testid="profile-menu-trigger"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 py-1 text-[#451A03] outline-none transition-colors hover:bg-amber-100/70 focus-visible:ring-2 focus-visible:ring-amber-600"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-200 text-sm font-bold text-[#78350F] sm:hidden">
                    {initials(user.name)}
                  </span>
                  <span className="hidden text-right sm:block" data-testid="current-user-info">
                    <span className="block text-sm font-semibold" data-testid="current-user-name">{user.name}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", ROLE_BADGE[user.role])}
                      data-testid="current-user-role">{ROLE_LABELS[user.role]}</span>
                  </span>
                  <ChevronDown className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-56 rounded-xl p-2">
                  <div className="px-2 py-2 text-sm sm:hidden">
                    <p className="font-semibold text-[#451A03]">{user.name}</p>
                    <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
                  </div>
                  {user.role === "coordenador" && (
                    <>
                      <DropdownMenuItem onClick={() => navigate("/configuracoes")} data-testid="profile-settings-link" className="min-h-10 rounded-lg px-3">
                        <Settings className="size-4" /> Configurações
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={() => void endSession()} data-testid="logout-button" className="min-h-10 rounded-lg px-3">
                    <LogOut className="size-4" /> Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-amber-900/10 bg-amber-50/95 backdrop-blur-xl md:hidden"
        data-testid="mobile-nav"
      >
        <NavItems leader={leader} pending={pending} mobile />
      </nav>
    </div>
  );
}
