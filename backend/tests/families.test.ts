import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import type { Database } from '../src/db.js';
import type { Family, FamilyInput, FamilyPerson } from '../../shared/types.js';

function adapter(engine:PGlite|Transaction):Database {
  return {query:async<T>(sql:string,params?:unknown[])=>(await engine.query<T>(sql,params)).rows,
    transaction:run=>'transaction' in engine?engine.transaction(tx=>run(adapter(tx))):run(adapter(engine))};
}
const migrationDir=new URL('../../supabase/migrations/',import.meta.url);
async function migrate(pg:PGlite, includeShared=true) {
  for(const file of (await readdir(migrationDir)).filter(f=>f.endsWith('.sql')&&(includeShared||f<'005')).sort()) {
    await pg.exec(await readFile(new URL(file,migrationDir),'utf8'));
  }
}
const external=(name:string,relationship:'parent'|'child',birthday:string|null='06-15')=>({name,relationship,birthday,user_id:null});

test('Famílias: só coordenação, identidade única, união e aniversários compartilhados',async t=> {
  const pg=new PGlite();t.after(()=>pg.close());await migrate(pg);
  const db=adapter(pg),app=createApp(db),password='Senha123456',hash=await hashPassword(password);
  const coordinator=request.agent(app),sub=request.agent(app),member=request.agent(app);
  const people:Record<string,string>={};
  for(const [username,name,role] of [['coord','Coordenação','coordenador'],['sub','Subcoordenação','subcoordenador'],['cleber','Cleber','membro'],['beth','Beth','membro'],['filho','Pedro Silva','membro']]) {
    const id=randomUUID();people[username]=id;
    await db.query("INSERT INTO users(id,username,name,password_hash,role,status,birthday) VALUES($1,$2,$3,$4,$5,'active','06-15')",[id,username,name,hash,role]);
  }
  for(const [agent,username] of [[coordinator,'coord'],[sub,'sub'],[member,'cleber']] as const) await agent.post('/api/auth/login').send({username,password}).expect(200);
  const linked=(username:string,relationship:'parent'|'child'='parent')=>({name:username,relationship,birthday:null,user_id:people[username]});
  const body:FamilyInput={name:'Família Cleber e Beth',people:[linked('cleber'),linked('beth'),external('João Silva','child')]};
  await t.test('nenhum vínculo por cadastro público ou por subcoordenadores',async()=> {
    await request(app).get('/api/families').expect(401);
    await request(app).get('/api/families/member-options').expect(401);
    for(const agent of [sub,member]) {
      await agent.get('/api/families').expect(403);
      await agent.get('/api/families/member-options').expect(403);
      await agent.post('/api/families').send(body).expect(403);
      await agent.put(`/api/families/${randomUUID()}`).send(body).expect(403);
      await agent.post(`/api/families/${randomUUID()}/merge`).send({source_id:randomUUID()}).expect(403);
      await agent.delete(`/api/families/${randomUUID()}`).expect(403);
    }
    await request(app).get('/api/members/spouse-options').expect(404);
    await request(app).post('/api/auth/signup').send({username:'novo',password,name:'Novo',spouse_id:people.cleber}).expect(422);
    await coordinator.post('/api/members').send({username:'indevido',password,name:'Indevido',family_members:[]}).expect(422);
    await coordinator.put(`/api/members/${people.cleber}`).send({name:'Cleber',family_id:randomUUID()}).expect(422);
  });
  let family:Family;
  await t.test('casal opcional, dados compartilhados e filho único no calendário',async()=> {
    family=(await coordinator.post('/api/families').send(body).expect(201)).body;
    assert.equal(family.people.length,3);
    const users=(await coordinator.get('/api/members')).body;
    assert.equal(users.find((p:{id:string})=>p.id===people.cleber).family_id,family.id);
    assert.equal(users.find((p:{id:string})=>p.id===people.beth).family_id,family.id);
    const birthdays=(await member.get('/api/birthdays').expect(200)).body;
    assert.equal(birthdays.filter((b:{name:string})=>b.name==='João Silva').length,1);
    assert.equal(birthdays.filter((b:{name:string})=>b.name==='Cleber').length,1);
    assert.equal(birthdays.find((b:{name:string})=>b.name==='João Silva').family_name,body.name);
    const options=(await coordinator.get('/api/families/member-options')).body;
    assert.equal(options.find((p:{id:string})=>p.id===people.beth).family_id,family.id);
    assert.ok(!('phone' in options[0]));
  });
  await t.test('duplicatas com acentos, caixa e espaços; datas inválidas; vínculo exclusivo',async()=> {
    await coordinator.put(`/api/families/${family.id}`).send({...family,people:[...family.people,external('  JOAO   SILVA  ','child')]}).expect(409);
    await coordinator.post('/api/families').send({name:'Outra família',people:[external('Outro responsável','parent'),external('Joao Silva','child')]}).expect(409);
    await coordinator.post('/api/families').send({name:'Duplicada',people:[linked('beth')]}).expect(409);
    await coordinator.post('/api/families').send({name:'Duplicada',people:[external('Beth','parent')]}).expect(409);
    await coordinator.put(`/api/families/${family.id}`).send({...family,people:family.people.map(p=>({...p,birthday:'02-30'}))}).expect(422);
    await coordinator.put(`/api/families/${family.id}`).send({...family,people:[...family.people,{...external('Extra','child'),id:randomUUID()}]}).expect(422);
    assert.equal((await coordinator.get('/api/families')).body.length,1);
  });
  await t.test('familiares sem conta podem ser vinculados ao cadastro futuro sem novo aniversário',async()=> {
    const created=(await coordinator.post('/api/members').send({username:'joao',password,name:'João Silva',birthday:'06-15'}).expect(201)).body;
    assert.equal((await member.get('/api/birthdays')).body.filter((b:{name:string})=>b.name==='João Silva').length,1);
    family=(await coordinator.put(`/api/families/${family.id}`).send({...family,people:family.people.map(p=>p.name==='João Silva'?{...p,user_id:created.id}:p)}).expect(200)).body;
    assert.equal((await member.get('/api/birthdays')).body.filter((b:{name:string})=>b.name==='João Silva').length,1);
    const childId=family.people.find(p=>p.user_id===created.id)!.id;
    family=(await coordinator.put(`/api/families/${family.id}`).send({...family,people:[...family.people,linked('filho','child')]}).expect(200)).body;
    assert.equal(family.people.filter(p=>p.id===childId).length,1);
    await coordinator.put(`/api/members/${created.id}`).send({name:'João Silva atualizado',birthday:'02-29'}).expect(200);
    const refreshed=(await coordinator.get('/api/families')).body.find((f:Family)=>f.id===family.id);
    assert.equal(refreshed.people.find((p:FamilyPerson)=>p.id===childId).birthday,'02-29');
    await coordinator.delete(`/api/members/${created.id}`).expect(200);
    family=(await coordinator.get('/api/families')).body.find((f:Family)=>f.id===family.id);
    assert.equal(family.people.find(p=>p.id===childId)!.user_id,null);
    assert.equal(family.people.find(p=>p.id===childId)!.name,'João Silva atualizado');
    assert.equal((await member.get('/api/birthdays')).body.filter((b:{name:string})=>b.name==='João Silva atualizado').length,1);
  });
  await t.test('união de famílias preserva filhos e desfaz operações conflitantes',async()=> {
    // Move Beth into her own family, then rejoin without duplicating the children.
    family=(await coordinator.put(`/api/families/${family.id}`).send({...family,people:family.people.filter(p=>p.user_id!==people.beth)}).expect(200)).body;
    const other:Family=(await coordinator.post('/api/families').send({name:'Família de Beth',people:[linked('beth'),external('Ana Silva','child','07-20')]}).expect(201)).body;
    // Simulate duplicates inherited from historical per-parent records.
    await db.query("INSERT INTO family_people(id,family_id,name,relationship,birthday) VALUES($1,$2,'JOAO SILVA ATUALIZADO','child','02-29')",[randomUUID(),other.id]);
    family=(await coordinator.post(`/api/families/${family.id}/merge`).send({source_id:other.id}).expect(200)).body;
    assert.equal(family.people.filter(p=>p.name==='João Silva atualizado').length,1);
    assert.ok(family.people.some(p=>p.name==='Ana Silva'));
    assert.equal(family.people.filter(p=>p.relationship==='parent').length,2);
    assert.equal((await coordinator.get('/api/families')).body.length,1);
    const third:Family=(await coordinator.post('/api/families').send({name:'Terceira família',people:[external('Terceiro responsável','parent')]}).expect(201)).body;
    await coordinator.post(`/api/families/${family.id}/merge`).send({source_id:third.id}).expect(422);
    await db.query("INSERT INTO family_people(id,family_id,name,relationship,birthday) VALUES($1,$2,'Joao Silva atualizado','child','03-10')",[randomUUID(),third.id]);
    await coordinator.post(`/api/families/${family.id}/merge`).send({source_id:third.id}).expect(409);
    assert.equal((await coordinator.get('/api/families')).body.length,2);
    await coordinator.delete(`/api/families/${third.id}`).expect(200);
    await coordinator.delete(`/api/families/${family.id}`).expect(200);
    assert.ok((await coordinator.get('/api/members')).body.some((p:{id:string})=>p.id===people.beth));
    assert.ok(!(await member.get('/api/birthdays')).body.some((b:{name:string})=>b.name==='Ana Silva'));
  });
});

test('Migração de famílias: preserva cadastros e reúne os filhos compartilhados pelo casal',async t=> {
  const pg=new PGlite();t.after(()=>pg.close());await migrate(pg,false);
  const a=randomUUID(),b=randomUUID();
  for(const [id,username,name] of [[a,'cleber','Cleber'],[b,'beth','Beth']]) await pg.query("INSERT INTO users(id,username,name,password_hash,role,status,family_members) VALUES($1,$2,$3,'hash','membro','active',$4)",[id,username,name,JSON.stringify([{name:id===a?'João Silva':' JOÃO  SILVA ',relationship:'child',birthday:'02-29'}])]);
  await pg.query('UPDATE users SET spouse_id=$2 WHERE id=$1',[a,b]);await pg.query('UPDATE users SET spouse_id=$2 WHERE id=$1',[b,a]);
  await pg.exec('BEGIN');
  await pg.exec(await readFile(new URL('005_shared_families.sql',migrationDir),'utf8'));
  await pg.exec('COMMIT');
  await pg.exec(await readFile(new URL('006_family_access.sql',migrationDir),'utf8'));
  await pg.exec(await readFile(new URL('007_family_duplicate_cleanup.sql',migrationDir),'utf8'));
  assert.equal((await pg.query('SELECT * FROM families')).rows.length,1);
  const rls=await pg.query<{relrowsecurity:boolean}>("SELECT relrowsecurity FROM pg_class WHERE relname IN ('families','family_people')");
  assert.ok(rls.rows.every(row=>row.relrowsecurity));
  assert.equal((await pg.query("SELECT * FROM family_people WHERE relationship='parent'")).rows.length,2);
  assert.equal((await pg.query("SELECT * FROM family_people WHERE relationship='child'")).rows.length,1);
  assert.equal((await pg.query<{family_members:unknown[]}>('SELECT family_members FROM users')).rows[0].family_members.length,1);
});
