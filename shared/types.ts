// Contratos públicos compartilhados entre a API TypeScript e o frontend.
export type Role = "coordenador" | "subcoordenador" | "membro";
export type UserStatus = "active" | "pending";

export interface User {
  id: string;
  username: string;
  name: string;
  phone: string;
  notes: string | null;
  role: Role;
  sector_ids: string[];
  status: UserStatus;
  created_at: string | null;
  last_seen_at: string | null;
  served_count: number;
  last_served: string | null; // YYYY-MM-DD
}

export interface MemberCreate {
  username: string;
  password: string;
  name: string;
  phone: string;
  notes: string;
  role: Role;
  sector_ids: string[];
}
export interface MemberUpdate {
  name: string;
  phone: string;
  notes: string;
  role: Role;
  sector_ids: string[];
  password?: string | null;
}
export interface SignupIn {
  username: string;
  password: string;
  name: string;
  phone: string;
  sector_ids: string[];
  notes: string;
}
export interface LoginIn {
  username: string;
  password: string;
}
export interface HistoryItem {
  event_id: string;
  title: string;
  date: string;
  role_name: string | null;
}
export interface MessageOut {
  message: string;
}

export interface SectorOption {
  id: string;
  name: string;
}
export interface Sector {
  id: string;
  name: string;
  description: string;
  member_count: number;
  leaders: string[];
}
export interface SectorIn {
  name: string;
  description: string;
}

export interface EventRoleIn {
  id: string | null;
  name: string;
  slots: number | null;
}
export interface EventRoleOut {
  id: string;
  name: string;
  slots: number | null;
  taken: number;
}
export interface Helper {
  user_id: string;
  name: string;
  phone: string | null;
  role_id: string | null;
  role_name: string | null;
}
export interface EventItem {
  id: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM or ""
  location: string;
  sector_id: string | null;
  sector_name: string | null;
  escala_open: boolean;
  slots: number | null;
  roles: EventRoleOut[];
  helpers: Helper[];
  declined: Helper[];
  pending: Helper[];
  declined_count: number;
  attendance: string[];
  my_response: "going" | "not_going" | null;
  my_role_id: string | null;
  can_respond: boolean;
  can_manage: boolean;
  can_mark_attendance: boolean;
  is_past: boolean;
  created_at: string | null;
}
export interface EventIn {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  sector_id: string | null;
  escala_open: boolean;
  slots: number | null;
  roles: EventRoleIn[];
}
export interface RsvpIn {
  response: "going" | "not_going";
  role_id?: string | null;
}
export interface AttendanceIn {
  present_user_ids: string[];
}
