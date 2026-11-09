import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashPassword, verifyPassword } from '../src/auth.js';
import type { Database } from '../src/db.js';
import { apiPost } from '../../frontend/src/lib/api.js';
import type { BrandingStorage } from '../src/storage.js';
import type { User } from '../../shared/types.js';

function adapter(engine: PGlite | Transaction): Database {
  return {
    query: async <T>(sql: string, params?: unknown[]) => (await engine.query<T>(sql,params)).rows,
    transaction: run=>'transaction' in engine ? engine.transaction(tx=>run(adapter(tx))) : run(adapter(engine)),
  };
}

test('API: permissões, escalas, calendário, presença, sessões e exclusões',async t=> {
  const pg=new PGlite();
  await pg.exec(await readFile(new URL('../../supabase/migrations/001_initial.sql',import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../../supabase/migrations/002_event_identity_sectors.sql',import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../../supabase/migrations/003_member_birthdays.sql',import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../../supabase/migrations/004_member_spouses.sql',import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../../supabase/migrations/005_shared_families.sql',import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../../supabase/migrations/006_family_access.sql',import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../../supabase/migrations/008_family_requests.sql',import.meta.url),'utf8'));
  const files=new Map<string,Buffer>();
  let failUpload=false;
  const storage:BrandingStorage={
    ensureBucket:async()=>{},
    upload:async (kind,bytes)=>{
      if(failUpload) throw new Error('Upload failed');
      const url=`https://example.supabase.co/storage/v1/object/public/pastoral-branding/${kind}/${randomUUID()}.png`;
      files.set(url,bytes); return url;
    },
    remove:async url=>{files.delete(url);},
  };
  const db=adapter(pg), app=createApp(db,()=>storage);
  t.after(()=>pg.close());
  const adminId=randomUUID();
  const password='Teste-12345678';
  await db.query("INSERT INTO users(id,username,password_hash,name,role,status) VALUES ($1,'admin',$2,'Coordenação','coordenador','active')",[adminId,await hashPassword(password)]);
  const admin=request.agent(app), sub=request.agent(app), member=request.agent(app), outsider=request.agent(app);
  const login=async (agent: typeof admin, username: string) => agent.post('/api/auth/login').send({username,password}).expect(200);
  await t.test('sessão, serialização e proteção de origem',async ()=> {
    await request(app).get('/api/members').expect(401);
    await request(app).post('/api/auth/login').send({username:'admin',password:'errada'}).expect(401);
    const response=await login(admin,'admin');
    assert.ok(response.headers['set-cookie'][0].includes('HttpOnly'));
    assert.ok(!('password_hash' in response.body)); assert.equal(response.body.notes,null);
    await admin.post('/api/sectors').set('Origin','https://outro.example').send({name:'Inválido'}).expect(403);
  });
  const a=(await admin.post('/api/sectors').send({name:'Acolhida'}).expect(201)).body;
  const b=(await admin.post('/api/sectors').send({name:'Liturgia'}).expect(201)).body;
  async function createUser(username: string, role: string, sectorIds: string[]) {
    return (await admin.post('/api/members').send({username,password,name:username,role,sector_ids:sectorIds,coordinated_sector_ids:role==='subcoordenador'?sectorIds:[],notes:'Privado'}).expect(201)).body;
  }
  const leader=await createUser('lider','subcoordenador',[a.id]);
  const person=await createUser('membro','membro',[a.id,b.id]);
  const outside=await createUser('externo','membro',[b.id]);
  await login(sub,'lider'); await login(member,'membro'); await login(outsider,'externo');
  await t.test('cadastro público, validação e aprovação',async ()=> {
    await request(app).get('/api/sectors/options').expect(200);
    await request(app).post('/api/auth/signup').send({username:'novo',password,name:'Novo',sector_ids:[a.id]}).expect(201);
    await request(app).post('/api/auth/signup').send({username:'novo',password,name:'Novo'}).expect(409);
    await request(app).post('/api/auth/signup').send({username:'xx',password:'1',name:'N'}).expect(422);
    await request(app).post('/api/auth/login').send({username:'novo',password}).expect(403);
    const pending=(await sub.get('/api/members?status=pending').expect(200)).body;
    assert.equal(pending.length,1);
    // Passe pelo cliente real: ações sem corpo não devem enviar o literal JSON null.
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, init) => {
        const call = sub.post(String(url));
        if (init?.headers) call.set(init.headers as Record<string, string>);
        if (init?.body !== undefined) call.send(String(init.body));
        const response = await call;
        return new Response(JSON.stringify(response.body), {status: response.status, headers: {'Content-Type': 'application/json'}});
      };
      const approved = await apiPost<User>(`/members/${pending[0].id}/approve`);
      assert.equal(approved.status, 'active');
    } finally { globalThis.fetch = originalFetch; }
    await sub.post(`/api/members/${pending[0].id}/approve`).expect(400);
    await sub.delete(`/api/members/${pending[0].id}`).expect(403);
  });
  await t.test('escopo e privilégios dos membros e subcoordenadores',async ()=> {
    await member.get('/api/members').expect(403);
    await sub.post('/api/sectors').send({name:'Novo setor'}).expect(403);
    await sub.put(`/api/members/${outside.id}`).send({name:'Externo'}).expect(404);
    const response=await sub.put(`/api/members/${person.id}`).send({name:'Membro alterado',role:'coordenador',sector_ids:[a.id]}).expect(200);
    assert.equal(response.body.role,'membro'); assert.ok(response.body.sector_ids.includes(b.id));
    const created=(await sub.post('/api/members').send({username:'criado',password,name:'Criado',role:'coordenador',sector_ids:[b.id]}).expect(201)).body;
    assert.equal(created.role,'membro'); assert.deepEqual(created.sector_ids,[a.id]);
    await sub.put(`/api/members/${leader.id}`).send({name:'Lider',role:'coordenador',sector_ids:[b.id]}).expect(200);
    const me=(await sub.get('/api/auth/me').expect(200)).body;
    assert.equal(me.role,'subcoordenador'); assert.deepEqual(me.sector_ids,[a.id]);
    await admin.put(`/api/members/${adminId}`).send({name:'Coordenação',role:'membro'}).expect(400);
  });
  await t.test('aniversário individual e bloqueio dos vínculos no cadastro',async()=> {
    const payload={username:'aniversariante',password,name:'Aniversariante',birthday:'02-29'};
    for (const birthday of ['02-30','04-31','13-01','00-10','6-15']) await admin.post('/api/members').send({...payload,birthday}).expect(422);
    const created=(await admin.post('/api/members').send(payload).expect(201)).body;
    assert.equal(created.birthday,'02-29');
    await sub.put(`/api/members/${person.id}`).send({name:'Membro',spouse_id:outside.id}).expect(422);
    await request(app).post('/api/auth/signup').send({...payload,username:'indevido',spouse_id:created.id}).expect(422);
    await request(app).post('/api/auth/signup').send({...payload,username:'indevido',family_members:[]}).expect(422);
    const birthdays=(await member.get('/api/birthdays').expect(200)).body;
    assert.ok(birthdays.some((b:{member_id:string;birthday:string})=>b.member_id===created.id && b.birthday==='02-29'));
    await admin.delete(`/api/members/${created.id}`).expect(200);
  });
  const eventBody={title:'Celebração',date:'2099-06-15',time:'18:00',sector_id:a.id,roles:[{name:'Recepção',slots:1}]};
  const event=(await admin.post('/api/events').send(eventBody).expect(201)).body;
  await t.test('funções, capacidade e privacidade da escala',async ()=> {
    await member.post('/api/events').send(eventBody).expect(403);
    await sub.put(`/api/events/${event.id}`).send(eventBody).expect(403);
    await outsider.post(`/api/events/${event.id}/rsvp`).send({response:'going',role_id:event.roles[0].id}).expect(403);
    await member.post(`/api/events/${event.id}/rsvp`).send({response:'going'}).expect(400);
    const going=(await member.post(`/api/events/${event.id}/rsvp`).send({response:'going',role_id:event.roles[0].id}).expect(200)).body;
    assert.equal(going.helpers[0].phone,null); assert.deepEqual(going.pending,[]); assert.deepEqual(going.attendance,[]);
    assert.equal(going.roles[0].taken,1);
    await sub.post(`/api/events/${event.id}/rsvp`).send({response:'going',role_id:event.roles[0].id}).expect(409);
    await member.post(`/api/events/${event.id}/rsvp`).send({response:'going',role_id:event.roles[0].id}).expect(200);
    await member.delete(`/api/events/${event.id}/rsvp`).expect(200);
    await sub.post(`/api/events/${event.id}/rsvp`).send({response:'not_going'}).expect(200);
    const ev=(await member.get('/api/events?month=2099-06').expect(200)).body[0];
    assert.equal(ev.declined_count,1); assert.deepEqual(ev.declined,[]);
    assert.ok((await admin.get('/api/events?month=2099-06')).body[0].pending.length);
    await member.get('/api/events?month=2099-99').expect(422);
    await admin.post('/api/events').send({...eventBody,date:'2026-02-30'}).expect(422);
  });
  await t.test('presença, estatísticas e atualização de datas',async ()=> {
    await admin.put(`/api/events/${event.id}/attendance`).send({present_user_ids:[person.id]}).expect(400);
    await member.put(`/api/events/${event.id}/attendance`).send({present_user_ids:[]}).expect(403);
    await admin.put(`/api/events/${event.id}`).send({...eventBody,date:'2020-06-15',roles:event.roles}).expect(200);
    await sub.put(`/api/events/${event.id}/attendance`).send({present_user_ids:[person.id,person.id]}).expect(200);
    const me=(await member.get('/api/auth/me').expect(200)).body;
    assert.equal(me.served_count,1); assert.equal(me.last_served,'2020-06-15'); assert.equal(me.notes,null);
    const history=(await sub.get(`/api/members/${person.id}/history`).expect(200)).body;
    assert.equal(history.length,1); assert.equal(history[0].event_id,event.id);
    await outsider.get(`/api/members/${person.id}/history`).expect(403);
    await admin.put(`/api/events/${event.id}`).send({...eventBody,date:'2020-06-16'}).expect(200);
    assert.equal((await member.get('/api/auth/me')).body.last_served,'2020-06-16');
    await member.post(`/api/events/${event.id}/rsvp`).send({response:'going'}).expect(400);
  });
  await t.test('limite geral de vagas e escala fechada',async ()=> {
    const ev=(await admin.post('/api/events').send({...eventBody,roles:[],sector_id:null,slots:1}).expect(201)).body;
    await member.post(`/api/events/${ev.id}/rsvp`).send({response:'going'}).expect(200);
    await outsider.post(`/api/events/${ev.id}/rsvp`).send({response:'going'}).expect(409);
    await admin.put(`/api/events/${ev.id}`).send({...eventBody,roles:[],escala_open:false}).expect(200);
    await member.post(`/api/events/${ev.id}/rsvp`).send({response:'not_going'}).expect(400);
  });
  await t.test('identidade, autoria, cores e subcoordenação por setor',async ()=> {
    const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
    await request(app).post('/api/settings/images/logo').set('Content-Type','image/png').send(image).expect(401);
    await member.post('/api/settings/images/logo').set('Content-Type','image/png').send(image).expect(403);
    await sub.post('/api/settings/images/logo').set('Content-Type','image/png').send(image).expect(403);
    await admin.post('/api/settings/images/other').set('Content-Type','image/png').send(image).expect(422);
    await admin.post('/api/settings/images/logo').set('Content-Type','image/png').send(Buffer.from('not an image')).expect(422);
    await admin.post('/api/settings/images/logo').set('Content-Type','image/svg+xml').send('<svg/>').expect(422);
    await admin.post('/api/settings/images/logo').set('Content-Type','image/png').send(Buffer.alloc(1024*1024+1)).expect(413);
    const first=(await admin.post('/api/settings/images/logo').set('Content-Type','image/png').send(image).expect(200)).body;
    const hero=(await admin.post('/api/settings/images/hero').set('Content-Type','image/png').send(image).expect(200)).body;
    assert.equal(hero.logo_url,first.logo_url);
    assert.ok(!hero.hero_url.startsWith('data:'));
    const second=(await admin.post('/api/settings/images/logo').set('Content-Type','image/png').send(image).expect(200)).body;
    assert.equal(second.hero_url,hero.hero_url);
    assert.ok(!files.has(first.logo_url)); assert.ok(files.has(second.logo_url));
    assert.equal((await request(app).get('/api/settings').expect(200)).body.logo_url,second.logo_url);
    failUpload=true;
    await admin.post('/api/settings/images/logo').set('Content-Type','image/png').send(image).expect(500);
    failUpload=false;
    assert.equal((await request(app).get('/api/settings')).body.logo_url,second.logo_url);
    const ev=(await admin.post('/api/events').send({...eventBody,event_type:'Formação',color:'#7c3aed'}).expect(201)).body;
    assert.equal(ev.created_by,adminId); assert.equal(ev.created_by_name,'Coordenação');
    assert.equal(ev.color,'#7c3aed'); assert.equal(ev.event_type,'Formação');
    await admin.post('/api/events').send({...eventBody,color:'red'}).expect(422);
    await admin.put(`/api/members/${leader.id}`).send({name:'Lider',role:'subcoordenador',sector_ids:[a.id,b.id],coordinated_sector_ids:[a.id]}).expect(200);
    assert.deepEqual((await sub.get('/api/auth/me')).body.coordinated_sector_ids,[a.id]);
    const other=(await admin.post('/api/events').send({...eventBody,date:'2020-01-01',sector_id:b.id}).expect(201)).body;
    await sub.put(`/api/events/${other.id}/attendance`).send({present_user_ids:[]}).expect(403);
    assert.ok(!(await sub.get('/api/members')).body.some((u:User)=>u.id===outside.id));
    await request(app).post('/api/auth/signup').send({username:'elevacao',password,name:'Cadastro',role:'coordenador',coordinated_sector_ids:[a.id]}).expect(201);
    const [signup]=await db.query<User>("SELECT * FROM users WHERE username='elevacao'");
    assert.equal(signup.role,'membro'); assert.deepEqual(signup.coordinated_sector_ids,[]);
  });
  await t.test('exclusões em cascata e invalidação da sessão',async ()=> {
    await admin.delete(`/api/events/${event.id}`).expect(200);
    assert.equal((await member.get('/api/auth/me')).body.served_count,0);
    await admin.delete(`/api/sectors/${a.id}`).expect(200);
    assert.deepEqual((await member.get('/api/auth/me')).body.sector_ids,[b.id]);
    await admin.delete(`/api/members/${outside.id}`).expect(200);
    await outsider.get('/api/auth/me').expect(401);
    await member.post('/api/auth/logout').expect(200); await member.get('/api/auth/me').expect(401);
    await admin.delete(`/api/members/${adminId}`).expect(400);
  });
});

test('compatibilidade PBKDF2 das senhas do Python',async ()=> {
  // hashlib.pbkdf2_hmac("sha256", b"membro123", b"0123456789abcdef", 200000).hex()
  const stored='0123456789abcdef$ad88564e368e0d19106d1bac126cbfff80e6d54bd4fc79c22ad492bd9c320957';
  assert.ok(await verifyPassword('membro123',stored)); assert.equal(await verifyPassword('outra',stored),false);
  assert.equal(await verifyPassword('outra','invalid'),false);
});
