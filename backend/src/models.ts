import { z } from 'zod';
import type { BirthdayProfile, Role, UserStatus } from '../../shared/types.js';
export interface Person extends BirthdayProfile {
  id: string; username: string; password_hash: string; name: string; phone: string;
  notes: string; role: Role; sector_ids: string[]; coordinated_sector_ids: string[]; status: UserStatus;
  created_at: string; last_seen_at: string | null;
}
export interface EventDoc {
  event_type: string; color: string;
  id: string; title: string; description: string; date: string; time: string;
  location: string; sector_id: string | null; escala_open: boolean; slots: number | null;
  roles: {id: string; name: string; slots: number | null}[]; created_at: string; created_by: string | null;
}
export interface Rsvp {event_id: string; user_id: string; response: 'going' | 'not_going'; role_id: string | null}
export interface Attendance {event_id: string; user_id: string; event_date: string}
export interface SectorDoc {id: string; name: string; description: string}
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const username = text(3, 30).regex(/^[a-zA-Z0-9._-]+$/).transform(s => s.toLowerCase());
const password = z.string().min(6).max(100);
const sectors = z.array(z.string().uuid()).max(500).default([]).transform(s => [...new Set(s)]);
export const birthdaySchema = z.string().regex(/^\d{2}-\d{2}$/).refine(value => z.iso.date().safeParse(`2000-${value}`).success, 'Dia e mês inválidos').nullable();
export const familyInformationSchema = z.object({
  people: z.array(z.object({name:text(2,100),relationship:z.enum(['spouse','child']),birthday:birthdaySchema}).strict()).min(1).max(500),
  note: text(0,1000).default(''),
}).strict().superRefine((info,ctx)=> {
  if (info.people.filter(p=>p.relationship==='spouse').length>1) ctx.addIssue({code:'custom',message:'Informe apenas um esposo(a)',path:['people']});
  const names=new Set<string>();
  info.people.forEach((person,index)=> {
    const name=person.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
    if(names.has(name)) ctx.addIssue({code:'custom',message:'Esta pessoa já foi informada',path:['people',index,'name']});
    names.add(name);
  });
});
export const profileSchema = z.object({
  birthday: birthdaySchema.optional(),
  name: text(2, 100), phone: text(0, 30).default(''), notes: text(0, 1000).default(''),
  role: z.enum(['coordenador', 'subcoordenador', 'membro']).default('membro'), sector_ids: sectors, coordinated_sector_ids: sectors,
});
export const memberSchema = profileSchema.extend({username, password});
export const updateMemberSchema = profileSchema.extend({password: password.nullable().optional()});
export const signupSchema = memberSchema.omit({role: true, coordinated_sector_ids: true}).extend({family_information:familyInformationSchema.optional()});
export const loginSchema = z.object({username: z.string().trim().toLowerCase().max(100), password: z.string().max(100)});
export const sectorSchema = z.object({name: text(2, 60), description: text(0, 300).default('')});
const slots = z.number().int().min(1).max(500).nullable().default(null);
export const eventSchema = z.object({
  event_type: text(1, 60).default('Encontro'), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#15803d'),
  title: text(2, 120), description: text(0, 2000).default(''), date: z.iso.date(),
  time: z.string().regex(/^(?:([01]\d|2[0-3]):[0-5]\d)?$/).default(''),
  location: text(0, 120).default(''), sector_id: z.string().uuid().nullable().default(null),
  escala_open: z.boolean().default(true), slots,
  roles: z.array(z.object({id: z.string().uuid().nullable().default(null), name: text(1,60), slots})).max(30).default([]),
});
export const rsvpSchema = z.object({response: z.enum(['going', 'not_going']), role_id: z.string().uuid().nullable().optional()});
export const attendanceSchema = z.object({present_user_ids: z.array(z.string().uuid()).max(2000).default([])});
