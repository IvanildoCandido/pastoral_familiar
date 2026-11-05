import type { Database } from './db.js';
import type { Person, EventDoc, Rsvp, Attendance, SectorDoc } from './models.js';
import type { User, EventItem, Helper } from '../../shared/types.js';
import { today } from './auth.js';
export async function publicUsers(db: Database, people: Person[], hideNotes = false): Promise<User[]> {
  const stats = await db.query<{user_id: string; count: string; last: string}>(
    'SELECT user_id,count(*)::text AS count,max(event_date) AS last FROM attendance WHERE user_id=ANY($1::uuid[]) GROUP BY user_id', [people.map(u => u.id)]);
  return people.map(u => {
    const stat = stats.find(s => s.user_id === u.id);
    return {id:u.id, username:u.username, name:u.name, phone:u.phone, notes:hideNotes ? null : u.notes,
      role:u.role, sector_ids:u.sector_ids, status:u.status, created_at:u.created_at, last_seen_at:u.last_seen_at,
      served_count:Number(stat?.count || 0), last_served:stat?.last || null};
  });
}
export const canRespond = (u: Person, e: EventDoc) => !e.sector_id || u.role === 'coordenador' || u.sector_ids.includes(e.sector_id);
export async function buildEvents(db: Database, docs: EventDoc[], principal: Person): Promise<EventItem[]> {
  if (!docs.length) return [];
  const leader = principal.role !== 'membro';
  const ids = docs.map(d => d.id);
  const rsvps = await db.query<Rsvp>('SELECT * FROM rsvps WHERE event_id=ANY($1::uuid[]) ORDER BY created_at', [ids]);
  const users = await db.query<Person>("SELECT * FROM users WHERE status='active' ORDER BY name");
  const sectors = await db.query<SectorDoc>('SELECT * FROM sectors');
  const attendance = leader ? await db.query<Attendance>('SELECT * FROM attendance WHERE event_id=ANY($1::uuid[])', [ids]) : [];
  return docs.map(d => {
    const roles = d.roles;
    const helper = (u: Person, roleId: string | null = null): Helper => ({user_id:u.id, name:u.name,
      phone:leader ? u.phone : null, role_id:roleId, role_name:roles.find(r => r.id===roleId)?.name || null});
    const responses = rsvps.filter(r => r.event_id===d.id && users.some(u => u.id===r.user_id));
    const helpers = responses.filter(r => r.response==='going').map(r => helper(users.find(u => u.id===r.user_id)!, roles.some(x=>x.id===r.role_id) ? r.role_id : null));
    const declined = responses.filter(r => r.response==='not_going').map(r => helper(users.find(u => u.id===r.user_id)!));
    const mine = responses.find(r => r.user_id===principal.id);
    return {id:d.id, title:d.title, description:d.description, date:d.date, time:d.time, location:d.location,
      sector_id:d.sector_id, sector_name:sectors.find(s=>s.id===d.sector_id)?.name || null,
      escala_open:d.escala_open, slots:d.slots, created_at:d.created_at,
      roles:roles.map(r => ({...r, taken:helpers.filter(h=>h.role_id===r.id).length})), helpers,
      declined:leader ? declined : [], declined_count:declined.length,
      pending:leader && d.escala_open ? users.filter(u => !responses.some(r=>r.user_id===u.id) && (!d.sector_id || u.sector_ids.includes(d.sector_id))).map(u=>helper(u)) : [],
      attendance:attendance.filter(a=>a.event_id===d.id).map(a=>a.user_id), my_response:mine?.response || null,
      my_role_id:mine?.role_id || null, can_respond:canRespond(principal,d), can_manage:leader,
      can_mark_attendance:leader && d.date<=today(), is_past:d.date<today()};
  });
}
