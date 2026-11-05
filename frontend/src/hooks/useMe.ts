import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { Sector, SectorOption, User } from "@/lib/types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<User>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
}

export function useSectors(enabled = true) {
  return useQuery({
    queryKey: ["sectors"],
    queryFn: () => apiGet<Sector[]>("/sectors"),
    enabled,
  });
}

export function useSectorOptions() {
  return useQuery({
    queryKey: ["sector-options"],
    queryFn: () => apiGet<SectorOption[]>("/sectors/options"),
  });
}

export function isLeader(user: User | undefined): boolean {
  return user?.role === "coordenador" || user?.role === "subcoordenador";
}
