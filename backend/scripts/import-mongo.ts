/** Importa arquivos mongoexport --jsonArray. Nunca altera/exclui os dados de origem. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { database, closeDatabase } from '../src/db.js';
const directory=process.argv[2];
if (!directory) throw new Error('Uso: npm run db:import -- /caminho/mongo-export');
const uuid=z.string().uuid();
const date=z.union([z.string(),z.object({$date:z.union([z.string(),z.object({$numberLong:z.string()})])})]).transform(v=> {
  if (typeof v==='string') return new Date(v).toISOString();
  return new Date(typeof v.$date==='string' ? v.$date : Number(v.$date.$numberLong)).toISOString();
});
const userSchema=z.object({id:uuid,username:z.string(),password_hash:z.string(),name:z.string(),phone:z.string().default(''),notes:z.string().default(''),
  role:z.enum(['coordenador','subcoordenador','membro']),sector_ids:z.array(uuid).optional(),sector_id:uuid.nullable().optional(),
  status:z.enum(['active','pending']),created_at:date,last_seen_at:date.nullable().optional()});
const sectorSchema=z.object({id:uuid,name:z.string(),description:z.string().default('')});
const eventSchema=z.object({id:uuid,title:z.string(),description:z.string().default(''),date:z.iso.date(),time:z.string().default(''),location:z.string().default(''),sector_id:uuid.nullable().default(null),
  escala_open:z.boolean().default(true),slots:z.number().nullable().default(null),roles:z.array(z.object({id:uuid,name:z.string(),slots:z.number().nullable().default(null)})).default([]),created_by:uuid.nullable().optional(),created_at:date});
const rsvpSchema=z.object({id:uuid.optional(),event_id:uuid,user_id:uuid,response:z.enum(['going','not_going']),role_id:uuid.nullable().default(null),created_at:date});
const attendanceSchema=z.object({id:uuid.optional(),event_id:uuid,user_id:uuid,event_date:z.iso.date(),marked_by:uuid.nullable().optional(),marked_at:date});
async function load<T>(name: string,schema: z.ZodType<T>) {
  return z.array(schema).parse(JSON.parse(await readFile(path.join(directory,`${name}.json`),'utf8')));
}
try {
  const sectors=await load('sectors',sectorSchema),users=await load('users',userSchema),events=await load('events',eventSchema),rsvps=await load('rsvps',rsvpSchema),attendance=await load('attendance',attendanceSchema);
  await database.transaction(async tx=> {
    const [count]=await tx.query<{count:string}>('SELECT count(*)::text AS count FROM users');
    if (Number(count.count)) throw new Error('Importe em um banco vazio, antes de criar o coordenador.');
    for (const s of sectors) await tx.query('INSERT INTO sectors(id,name,description) VALUES ($1,$2,$3)',[s.id,s.name,s.description]);
    for (const u of users) await tx.query(`INSERT INTO users(id,username,password_hash,name,phone,notes,role,sector_ids,status,created_at,last_seen_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[u.id,u.username.toLowerCase(),u.password_hash,u.name,u.phone,u.notes,u.role,u.sector_ids || (u.sector_id?[u.sector_id]:[]),u.status,u.created_at,u.last_seen_at || null]);
    for (const e of events) await tx.query(`INSERT INTO events(id,title,description,date,time,location,sector_id,escala_open,slots,roles,created_by,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[e.id,e.title,e.description,e.date,e.time,e.location,e.sector_id,e.escala_open,e.slots,JSON.stringify(e.roles),users.some(u=>u.id===e.created_by) ? e.created_by : null,e.created_at]);
    for (const r of rsvps) await tx.query('INSERT INTO rsvps(id,event_id,user_id,response,role_id,created_at) VALUES ($1,$2,$3,$4,$5,$6)',[r.id || randomUUID(),r.event_id,r.user_id,r.response,r.role_id,r.created_at]);
    for (const a of attendance) await tx.query('INSERT INTO attendance(id,event_id,user_id,event_date,marked_by,marked_at) VALUES ($1,$2,$3,$4,$5,$6)',[a.id || randomUUID(),a.event_id,a.user_id,a.event_date,users.some(u=>u.id===a.marked_by) ? a.marked_by : null,a.marked_at]);
  });
  console.log('Dados importados. Senhas preservadas; sessões antigas precisam de novo login.');
} finally {await closeDatabase();}
