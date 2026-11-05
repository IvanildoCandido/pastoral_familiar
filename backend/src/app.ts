import express, { type ErrorRequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { database, type Database } from './db.js';
import { demand, HttpError, hashPassword, verifyPassword, startSession, logout, currentUser, requireLeader, requireCoordinator, inScope, today } from './auth.js';
import { loginSchema, signupSchema, memberSchema, updateMemberSchema, sectorSchema, eventSchema, rsvpSchema, attendanceSchema, type Person, type SectorDoc, type EventDoc, type Rsvp } from './models.js';
import { publicUsers, buildEvents, canRespond } from './views.js';

export function createApp(db: Database = database) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req,res,next) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    // Bloqueia mutações feitas por páginas de outra origem; cookies são sameSite=lax.
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin) {
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      try { demand(new URL(req.headers.origin).host===host,403,'Origem não permitida'); }
      catch (error) { return next(error instanceof HttpError ? error : new HttpError(403,'Origem não permitida')); }
    }
    next();
  });
  app.use(express.json({limit:'256kb'}));
  const api = express.Router();
  app.use('/api',api);
  const id = (value: unknown) => z.string().uuid().parse(value);
  async function validSectors(ids: string[]) {
    if (!ids.length) return [];
    const rows = await db.query<SectorDoc>('SELECT * FROM sectors WHERE id=ANY($1::uuid[])', [ids]);
    demand(rows.length===ids.length,400,'Setor inválido');
    return ids;
  }
  async function scopedMember(principal: Person, memberId: string) {
    const [target] = await db.query<Person>('SELECT * FROM users WHERE id=$1',[memberId]);
    demand(target && inScope(principal,target),404,'Membro não encontrado');
    return target;
  }
  async function eventDoc(eventId: string, conn = db, lock = false) {
    const [event] = await conn.query<EventDoc>(`SELECT * FROM events WHERE id=$1${lock ? ' FOR UPDATE' : ''}`,[eventId]);
    demand(event,404,'Evento não encontrado'); return event;
  }
  async function eventResult(eventId: string, principal: Person) {
    return (await buildEvents(db,[await eventDoc(eventId)],principal))[0];
  }
  api.get('/',(_req,res)=>res.json({message:'Pastoral API'}));
  api.post('/auth/login', async (req,res)=> {
    const body=loginSchema.parse(req.body);
    const [user]=await db.query<Person>('SELECT * FROM users WHERE username=$1',[body.username]);
    demand(user && await verifyPassword(body.password,user.password_hash),401,'Usuário ou senha incorretos');
    demand(user.status==='active',403,'Seu cadastro ainda aguarda aprovação da coordenação');
    await startSession(db,res,user.id);
    await db.query('UPDATE users SET last_seen_at=now() WHERE id=$1',[user.id]);
    user.last_seen_at=new Date().toISOString();
    res.json((await publicUsers(db,[user],true))[0]);
  });
  api.post('/auth/logout',async (req,res)=> {await logout(db,req,res); res.json({message:'ok'});});
  api.get('/auth/me',async (req,res)=>res.json((await publicUsers(db,[await currentUser(db,req)],true))[0]));
  api.post('/auth/signup',async (req,res)=> {
    const b=signupSchema.parse(req.body);
    const existing=await db.query<SectorDoc>('SELECT * FROM sectors WHERE id=ANY($1::uuid[])',[b.sector_ids]);
    await db.query(`INSERT INTO users (id,username,password_hash,name,phone,notes,role,sector_ids,status)
      VALUES ($1,$2,$3,$4,$5,$6,'membro',$7,'pending')`,[randomUUID(),b.username,await hashPassword(b.password),b.name,b.phone,b.notes,existing.map(s=>s.id)]);
    res.status(201).json({message:'Cadastro enviado! Aguarde a aprovação da coordenação.'});
  });
  api.get('/sectors/options',async (_req,res)=>res.json(await db.query('SELECT id,name FROM sectors ORDER BY name')));
  api.get('/sectors',async (req,res)=> {
    await currentUser(db,req);
    const sectors=await db.query<SectorDoc>('SELECT * FROM sectors ORDER BY name');
    const users=await db.query<Person>("SELECT * FROM users WHERE status='active'");
    res.json(sectors.map(s=>({...s,member_count:users.filter(u=>u.sector_ids.includes(s.id)).length,
      leaders:users.filter(u=>u.sector_ids.includes(s.id) && u.role!=='membro').map(u=>u.name)})));
  });
  api.post('/sectors',async (req,res)=> {
    requireCoordinator(await currentUser(db,req)); const b=sectorSchema.parse(req.body);
    const [sector]=await db.query<SectorDoc>('INSERT INTO sectors (id,name,description) VALUES ($1,$2,$3) RETURNING *',[randomUUID(),b.name,b.description]);
    res.status(201).json({...sector,member_count:0,leaders:[]});
  });
  api.put('/sectors/:id',async (req,res)=> {
    requireCoordinator(await currentUser(db,req)); const b=sectorSchema.parse(req.body);
    const [sector]=await db.query<SectorDoc>('UPDATE sectors SET name=$2,description=$3 WHERE id=$1 RETURNING *',[id(req.params.id),b.name,b.description]);
    demand(sector,404,'Setor não encontrado'); res.json({...sector,member_count:0,leaders:[]});
  });
  api.delete('/sectors/:id',async (req,res)=> {
    requireCoordinator(await currentUser(db,req)); const sectorId=id(req.params.id);
    await db.transaction(async tx=> {
      const rows=await tx.query('DELETE FROM sectors WHERE id=$1 RETURNING id',[sectorId]);
      demand(rows.length,404,'Setor não encontrado');
      await tx.query('UPDATE users SET sector_ids=array_remove(sector_ids,$1::uuid) WHERE $1::uuid=ANY(sector_ids)',[sectorId]);
    });
    res.json({message:'Setor removido'});
  });
  api.get('/members',async (req,res)=> {
    const principal=await currentUser(db,req); requireLeader(principal);
    const status=z.enum(['active','pending']).parse(req.query.status || 'active');
    const users=await db.query<Person>('SELECT * FROM users WHERE status=$1 ORDER BY name',[status]);
    res.json(await publicUsers(db,users.filter(u=>inScope(principal,u))));
  });
  api.get('/members/:id/history',async (req,res)=> {
    const principal=await currentUser(db,req); requireLeader(principal);
    const memberId=id(req.params.id); await scopedMember(principal,memberId);
    const rows=await db.query<EventDoc & {role_id:string|null}>(`SELECT e.*,r.role_id FROM attendance a JOIN events e ON e.id=a.event_id
      LEFT JOIN rsvps r ON r.event_id=a.event_id AND r.user_id=a.user_id WHERE a.user_id=$1 ORDER BY a.event_date DESC`,[memberId]);
    res.json(rows.map(e=>({event_id:e.id,title:e.title,date:e.date,role_name:e.roles.find(r=>r.id===e.role_id)?.name || null})));
  });
  api.post('/members',async (req,res)=> {
    const p=await currentUser(db,req); requireLeader(p); const b=memberSchema.parse(req.body);
    const sectorIds=p.role==='subcoordenador' ? (b.sector_ids.filter(s=>p.sector_ids.includes(s)).length ? b.sector_ids.filter(s=>p.sector_ids.includes(s)) : p.sector_ids) : await validSectors(b.sector_ids);
    const [user]=await db.query<Person>(`INSERT INTO users (id,username,password_hash,name,phone,notes,role,sector_ids,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active') RETURNING *`,[randomUUID(),b.username,await hashPassword(b.password),b.name,b.phone,b.notes,p.role==='subcoordenador'?'membro':b.role,sectorIds]);
    res.status(201).json((await publicUsers(db,[user]))[0]);
  });
  api.put('/members/:id',async (req,res)=> {
    const p=await currentUser(db,req); requireLeader(p); const memberId=id(req.params.id);
    const target=await scopedMember(p,memberId); const b=updateMemberSchema.parse(req.body);
    let role=target.role, sectorIds=target.sector_ids;
    if (p.role==='subcoordenador') {
      demand(target.role==='membro' || target.id===p.id,403,'Você só pode editar membros dos seus setores');
      if (target.id!==p.id) sectorIds=[...target.sector_ids.filter(s=>!p.sector_ids.includes(s)),...b.sector_ids.filter(s=>p.sector_ids.includes(s))];
    } else {
      demand(target.id!==p.id || b.role==='coordenador',400,'Você não pode remover seu próprio papel de coordenador');
      role=b.role; sectorIds=await validSectors(b.sector_ids);
    }
    const [user]=await db.transaction(async tx=> {
      const rows=await tx.query<Person>(`UPDATE users SET name=$2,phone=$3,notes=$4,role=$5,sector_ids=$6,password_hash=$7 WHERE id=$1 RETURNING *`,
        [memberId,b.name,b.phone,b.notes,role,sectorIds,b.password ? await hashPassword(b.password) : target.password_hash]);
      if (b.password) await tx.query('DELETE FROM sessions WHERE user_id=$1',[memberId]);
      return rows;
    });
    res.json((await publicUsers(db,[user]))[0]);
  });
  api.post('/members/:id/approve',async (req,res)=> {
    const p=await currentUser(db,req); requireLeader(p); const memberId=id(req.params.id);
    const target=await scopedMember(p,memberId); demand(target.status==='pending',400,'Este cadastro já está ativo');
    const [user]=await db.query<Person>("UPDATE users SET status='active' WHERE id=$1 RETURNING *",[memberId]);
    res.json((await publicUsers(db,[user]))[0]);
  });
  api.delete('/members/:id',async (req,res)=> {
    const p=await currentUser(db,req); requireLeader(p); const memberId=id(req.params.id);
    const target=await scopedMember(p,memberId);
    demand(target.id!==p.id,400,'Você não pode excluir a si mesmo');
    demand(p.role!=='subcoordenador' || target.status==='pending',403,'Apenas coordenadores podem excluir membros ativos');
    await db.query('DELETE FROM users WHERE id=$1',[memberId]); res.json({message:'Membro removido'});
  });
  api.get('/events',async (req,res)=> {
    const p=await currentUser(db,req);
    const scope=z.enum(['upcoming','past']).parse(req.query.scope || 'upcoming');
    let events: EventDoc[];
    if (req.query.month) {
      const month=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(req.query.month);
      events=await db.query<EventDoc>('SELECT * FROM events WHERE date >= $1 AND date <= $2 ORDER BY date,time',[`${month}-01`,`${month}-31`]);
    } else {
      events=await db.query<EventDoc>(`SELECT * FROM events WHERE date ${scope==='upcoming'?'>=':'<'} $1 ORDER BY date ${scope==='upcoming'?'ASC':'DESC'},time ${scope==='upcoming'?'ASC':'DESC'}`,[today()]);
    }
    res.json(await buildEvents(db,events,p));
  });
  api.post('/events',async (req,res)=> {
    const p=await currentUser(db,req); requireCoordinator(p); const b=eventSchema.parse(req.body);
    if (b.sector_id) await validSectors([b.sector_id]);
    const roles=b.roles.map(r=>({...r,id:r.id || randomUUID()}));
    demand(new Set(roles.map(r=>r.id)).size===roles.length,422,'Funções duplicadas');
    const eventId=randomUUID();
    await db.query(`INSERT INTO events (id,title,description,date,time,location,sector_id,escala_open,slots,roles,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[eventId,b.title,b.description,b.date,b.time,b.location,b.sector_id,b.escala_open,b.slots,JSON.stringify(roles),p.id]);
    res.status(201).json(await eventResult(eventId,p));
  });
  api.put('/events/:id',async (req,res)=> {
    const p=await currentUser(db,req); requireCoordinator(p); const eventId=id(req.params.id);
    const b=eventSchema.parse(req.body); if (b.sector_id) await validSectors([b.sector_id]);
    const roles=b.roles.map(r=>({...r,id:r.id || randomUUID()}));
    demand(new Set(roles.map(r=>r.id)).size===roles.length,422,'Funções duplicadas');
    await db.transaction(async tx=> {
      await eventDoc(eventId,tx,true);
      await tx.query(`UPDATE events SET title=$2,description=$3,date=$4,time=$5,location=$6,sector_id=$7,escala_open=$8,slots=$9,roles=$10 WHERE id=$1`,
        [eventId,b.title,b.description,b.date,b.time,b.location,b.sector_id,b.escala_open,b.slots,JSON.stringify(roles)]);
      await tx.query('UPDATE attendance SET event_date=$2 WHERE event_id=$1',[eventId,b.date]);
    });
    res.json(await eventResult(eventId,p));
  });
  api.delete('/events/:id',async (req,res)=> {
    requireCoordinator(await currentUser(db,req));
    const rows=await db.query('DELETE FROM events WHERE id=$1 RETURNING id',[id(req.params.id)]);
    demand(rows.length,404,'Evento não encontrado'); res.json({message:'Evento removido'});
  });
  api.post('/events/:id/rsvp',async (req,res)=> {
    const p=await currentUser(db,req); const eventId=id(req.params.id); const b=rsvpSchema.parse(req.body);
    // A trava do evento serializa reservas concorrentes, inclusive entre instâncias Vercel.
    await db.transaction(async tx=> {
      const ev=await eventDoc(eventId,tx,true);
      demand(ev.escala_open,400,'A escala deste evento está fechada');
      demand(ev.date>=today(),400,'Este evento já aconteceu');
      demand(canRespond(p,ev),403,'Esta escala é exclusiva para o setor do evento');
      let roleId: string | null=null;
      if (b.response==='going') {
        const others=await tx.query<Rsvp>("SELECT * FROM rsvps WHERE event_id=$1 AND user_id<>$2 AND response='going'",[eventId,p.id]);
        if (ev.roles.length) {
          const role=ev.roles.find(r=>r.id===b.role_id);
          demand(role,400,'Escolha uma função para ajudar'); roleId=role.id;
          demand(!role.slots || others.filter(r=>r.role_id===roleId).length<role.slots,409,'As vagas desta função já foram preenchidas');
        } else demand(!ev.slots || others.length<ev.slots,409,'As vagas desta escala já foram preenchidas');
      }
      await tx.query(`INSERT INTO rsvps (id,event_id,user_id,response,role_id) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (event_id,user_id) DO UPDATE SET response=excluded.response,role_id=excluded.role_id,created_at=now()`,[randomUUID(),eventId,p.id,b.response,roleId]);
    });
    res.json(await eventResult(eventId,p));
  });
  api.delete('/events/:id/rsvp',async (req,res)=> {
    const p=await currentUser(db,req); const eventId=id(req.params.id); await eventDoc(eventId);
    await db.query('DELETE FROM rsvps WHERE event_id=$1 AND user_id=$2',[eventId,p.id]);
    res.json(await eventResult(eventId,p));
  });
  api.put('/events/:id/attendance',async (req,res)=> {
    const p=await currentUser(db,req); requireLeader(p); const eventId=id(req.params.id); const b=attendanceSchema.parse(req.body);
    await db.transaction(async tx=> {
      const ev=await eventDoc(eventId,tx,true);
      demand(ev.date<=today(),400,'A presença só pode ser marcada no dia do evento ou depois');
      const users=await tx.query<Person>("SELECT * FROM users WHERE id=ANY($1::uuid[]) AND status='active'",[[...new Set(b.present_user_ids)]]);
      await tx.query('DELETE FROM attendance WHERE event_id=$1',[eventId]);
      for (const u of users) await tx.query('INSERT INTO attendance (id,event_id,user_id,event_date,marked_by) VALUES ($1,$2,$3,$4,$5)',[randomUUID(),eventId,u.id,ev.date,p.id]);
    });
    res.json(await eventResult(eventId,p));
  });
  app.use((_req,res)=>res.status(404).json({detail:'Rota não encontrada'}));
  const errors: ErrorRequestHandler=(error: unknown,_req,res,_next)=> {
    if (error instanceof z.ZodError) {res.status(422).json({detail:error.issues.map(i=>({loc:['body',...i.path],msg:i.message,type:i.code}))}); return;}
    if (error instanceof HttpError) {res.status(error.status).json({detail:error.message}); return;}
    const code=error && typeof error==='object' && 'code' in error ? error.code : undefined;
    if (code==='23505') {res.status(409).json({detail:'Este registro já está em uso'}); return;}
    if (code==='23503') {res.status(400).json({detail:'Registro relacionado inválido'}); return;}
    if (error instanceof SyntaxError && 'body' in error) {res.status(400).json({detail:'JSON inválido'}); return;}
    console.error('Falha na API:',error instanceof Error ? error.message : 'erro desconhecido');
    res.status(500).json({detail:'Erro interno do servidor'});
  };
  app.use(errors);
  return app;
}
export default createApp();
