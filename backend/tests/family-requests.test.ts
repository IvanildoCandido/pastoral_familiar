import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite,type Transaction } from '@electric-sql/pglite';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import type { Database } from '../src/db.js';
import type { Family,FamilyRequest,FamilyInput } from '../../shared/types.js';
function adapter(engine:PGlite|Transaction):Database {
  return {query:async<T>(sql:string,params?:unknown[])=>(await engine.query<T>(sql,params)).rows,transaction:run=>'transaction' in engine?engine.transaction(tx=>run(adapter(tx))):run(adapter(engine))};
}

test('Solicitações familiares: coleta privada, revisão exclusiva e vínculos sem duplicação',async t=> {
  const pg=new PGlite();t.after(()=>pg.close());
  const dir=new URL('../../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()) await pg.exec(await readFile(new URL(file,dir),'utf8'));
  const db=adapter(pg),app=createApp(db),password='Senha123456',hash=await hashPassword(password);
  const coordinator=request.agent(app),sub=request.agent(app),cleber=request.agent(app),beth=request.agent(app);
  const ids:Record<string,string>={};
  for(const [username,name,role] of [['coord','Coordenação','coordenador'],['sub','Subcoordenação','subcoordenador'],['cleber','Cleber Silva','membro'],['beth','Beth Silva','membro']]) {
    ids[username]=randomUUID();await db.query("INSERT INTO users(id,username,name,password_hash,role,status,birthday) VALUES($1,$2,$3,$4,$5,'active','06-15')",[ids[username],username,name,hash,role]);
  }
  for(const [agent,username] of [[coordinator,'coord'],[sub,'sub'],[cleber,'cleber'],[beth,'beth']] as const) await agent.post('/api/auth/login').send({username,password}).expect(200);
  const information={people:[{name:'Beth Silva',relationship:'spouse',birthday:'06-15'},{name:'João Silva',relationship:'child',birthday:'02-29'}],note:'O filho também foi informado pela mãe.'};
  const mine=async(agent:typeof cleber)=>(await agent.get('/api/family-requests/mine').expect(200)).body;
  const inbox=async():Promise<FamilyRequest[]> => (await coordinator.get('/api/families/requests').expect(200)).body;
  let pending:FamilyRequest;
  const linked=(username:string)=>({user_id:ids[username],name:username,relationship:'parent' as const,birthday:null});
  await t.test('informações não criam vínculos nem aniversários e permanecem privadas',async()=> {
    await request(app).post('/api/family-requests').send(information).expect(401);
    await request(app).get('/api/family-requests/mine').expect(401);
    await cleber.post('/api/family-requests').send({...information,submitted_by:ids.beth}).expect(422);
    await cleber.post('/api/family-requests').send({...information,people:[{...information.people[0],user_id:ids.beth}]}).expect(422);
    await cleber.post('/api/family-requests').send(information).expect(201);
    pending=(await inbox())[0];
    assert.equal(pending.submitted_by,ids.cleber);
    assert.equal((await mine(beth)).requests.length,0);
    assert.equal((await mine(cleber)).requests.length,1);
    assert.equal((await coordinator.get('/api/families')).body.length,0);
    assert.ok(!(await cleber.get('/api/birthdays')).body.some((b:{name:string})=>b.name==='João Silva'));
    for(const agent of [cleber,sub]) {
      await agent.get('/api/families/requests').expect(403);
      await agent.post(`/api/families/requests/${pending.id}/approve`).send({}).expect(403);
      await agent.post(`/api/families/requests/${pending.id}/reject`).send({}).expect(403);
    }
  });
  await t.test('atualização pendente não duplica pedidos e impede revisão de versão antiga',async()=> {
    const old=pending;
    await cleber.post('/api/family-requests').send({...information,note:'Informações atualizadas'}).expect(201);
    pending=(await inbox())[0];
    assert.equal(pending.id,old.id);assert.notEqual(pending.revision,old.revision);assert.equal((await inbox()).length,1);
    await coordinator.post(`/api/families/requests/${old.id}/reject`).send({revision:old.revision,note:'Corrigir nome'}).expect(409);
    await coordinator.post(`/api/families/requests/${old.id}/approve`).send({revision:old.revision,family_id:null,family:{name:'Família nova',people:[linked('cleber')]}}).expect(409);
    await cleber.post('/api/family-requests').send({...information,people:[...information.people,{name:' JOAO   SILVA ',relationship:'child',birthday:'02-29'}]}).expect(422);
    await cleber.post('/api/family-requests').send({...information,people:[{name:'Inválido',relationship:'child',birthday:'02-30'}]}).expect(422);
    await cleber.post('/api/family-requests').send({people:[{name:'Cleber Silva',relationship:'child',birthday:null}],note:''}).expect(422);
  });
  let family:Family;
  await t.test('coordenador reaproveita a família e o filho existentes; aprovação é atômica',async()=> {
    family=(await coordinator.post('/api/families').send({name:'Família de Beth',people:[linked('beth'),{user_id:null,name:'João Silva',relationship:'child',birthday:'02-29'}]}).expect(201)).body;
    const conflicting:FamilyInput={name:'Família repetida',people:[linked('cleber'),linked('beth'),{user_id:null,name:'João Silva',relationship:'child',birthday:'02-29'}]};
    await coordinator.post(`/api/families/requests/${pending.id}/approve`).send({revision:pending.revision,family_id:null,family:conflicting}).expect(409);
    assert.equal((await coordinator.get('/api/families')).body.length,1);assert.equal((await inbox()).length,1);
    await coordinator.post(`/api/families/requests/${pending.id}/approve`).send({revision:pending.revision,family_id:family.id,family}).expect(422);
    const approval={revision:pending.revision,note:'Família conferida e filho reaproveitado',family_id:family.id,family:{...family,people:[...family.people,linked('cleber')]}};
    const statuses=(await Promise.all([coordinator.post(`/api/families/requests/${pending.id}/approve`).send(approval),coordinator.post(`/api/families/requests/${pending.id}/approve`).send(approval)])).map(r=>r.status).sort();
    assert.deepEqual(statuses,[200,409]);
    const result=await mine(cleber);family=result.family;
    assert.equal(family.people.length,3);assert.equal(result.requests[0].status,'approved');assert.equal(result.requests[0].review_note,approval.note);
    assert.equal((await mine(beth)).family.id,family.id);
    assert.equal((await cleber.get('/api/birthdays')).body.filter((b:{name:string})=>b.name==='João Silva').length,1);
    assert.equal((await inbox()).length,0);
    const source=(await coordinator.get('/api/families/requests?status=approved')).body;assert.equal(source.length,1);
  });
  await t.test('devolução orienta correção e reenvio mantém histórico sem alterar família confirmada',async()=> {
    await beth.post('/api/family-requests').send({people:[{name:'Ana Silva',relationship:'child',birthday:'10-10'}],note:''}).expect(201);
    const requested=(await inbox())[0];
    await coordinator.post(`/api/families/requests/${requested.id}/reject`).send({revision:requested.revision,note:''}).expect(422);
    await coordinator.post(`/api/families/requests/${requested.id}/reject`).send({revision:requested.revision,note:'Confirme o dia do aniversário'}).expect(200);
    const returned=await mine(beth);assert.equal(returned.requests[0].status,'rejected');assert.match(returned.requests[0].review_note,/Confirme/);
    assert.equal(returned.family.people.length,3);
    await beth.post('/api/family-requests').send({people:[{name:'Ana Silva',relationship:'child',birthday:'10-11'}],note:'Corrigido'}).expect(201);
    const corrected=await mine(beth);assert.equal(corrected.requests.length,2);assert.equal(corrected.requests[0].status,'pending');assert.notEqual(corrected.requests[0].id,requested.id);
    assert.ok(!(await cleber.get('/api/birthdays')).body.some((b:{name:string})=>b.name==='Ana Silva'));
    await coordinator.post(`/api/families/requests/${corrected.requests[0].id}/approve`).send({revision:corrected.requests[0].revision,family_id:family.id,family:{...family,people:[...family.people,{user_id:null,name:'Ana Silva',relationship:'child',birthday:'10-11'}]}}).expect(200);
    assert.equal((await cleber.get('/api/birthdays')).body.filter((b:{name:string})=>b.name==='Ana Silva').length,1);
  });
  await t.test('cadastro público coleta dados opcionais; acesso e família têm aprovações separadas',async()=> {
    const signup={username:'novafamilia',password,name:'Membro novo',family_information:{people:[{name:'Filho novo',relationship:'child',birthday:'03-20'}],note:''}};
    await request(app).post('/api/auth/signup').send({...signup,family_information:{...signup.family_information,people:[{...signup.family_information.people[0],birthday:'02-31'}]}}).expect(422);
    assert.equal((await db.query("SELECT id FROM users WHERE username='novafamilia'")).length,0);
    await request(app).post('/api/auth/signup').send(signup).expect(201);
    const submitted=(await inbox())[0];assert.equal(submitted.submitter_status,'pending');
    const confirmation={revision:submitted.revision,family_id:null,family:{name:'Família nova',people:[{user_id:submitted.submitted_by,name:'Membro novo',relationship:'parent',birthday:null},{user_id:null,name:'Filho novo',relationship:'child',birthday:'03-20'}]}};
    await coordinator.post(`/api/families/requests/${submitted.id}/approve`).send(confirmation).expect(409);
    await coordinator.post(`/api/members/${submitted.submitted_by}/approve`).expect(200);
    assert.ok(!(await cleber.get('/api/birthdays')).body.some((b:{name:string})=>b.name==='Filho novo'));
    await coordinator.post(`/api/families/requests/${submitted.id}/approve`).send(confirmation).expect(200);
    assert.ok((await cleber.get('/api/birthdays')).body.some((b:{name:string})=>b.name==='Filho novo'));
    const rls=(await pg.query<{relrowsecurity:boolean}>("SELECT relrowsecurity FROM pg_class WHERE relname='family_requests'")).rows[0];assert.equal(rls.relrowsecurity,true);
  });
});
