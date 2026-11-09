import type { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from './db.js';
import { currentUser, demand, requireCoordinator } from './auth.js';
import { birthdaySchema, type Person } from './models.js';
import type { Birthday, Family, FamilyInput, FamilyPerson } from '../../shared/types.js';

export const normalizeFamilyName = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
export const familyInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  people: z.array(z.object({id:z.string().uuid().optional(),user_id:z.string().uuid().nullable(),
    relationship:z.enum(['parent','child']),name:z.string().trim().min(2).max(100),birthday:birthdaySchema})).min(1).max(500),
});
const uuid = (value: unknown) => z.string().uuid().parse(value);
export const lockFamilies = (db: Database) => db.query('SELECT pg_advisory_xact_lock(773043)');

export async function listFamilies(db: Database): Promise<Family[]> {
  const families = await db.query<{id:string;name:string}>('SELECT id,name FROM families ORDER BY name');
  const people = await db.query<FamilyPerson & {family_id:string}>(`SELECT p.id,p.family_id,p.user_id,p.relationship,
    coalesce(u.name,p.name) AS name,CASE WHEN p.user_id IS NOT NULL THEN u.birthday ELSE p.birthday END AS birthday
    FROM family_people p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.relationship DESC,coalesce(u.name,p.name)`);
  return families.map(f=>({...f,people:people.filter(p=>p.family_id===f.id).map(({family_id,...person})=>person)}));
}

export async function saveFamily(db: Database, familyId: string, data: FamilyInput) {
  const existing = await db.query<FamilyPerson>('SELECT * FROM family_people WHERE family_id=$1',[familyId]);
  const ids = new Set<string>(), names = new Set<string>(), users = new Set<string>();
  const people: FamilyPerson[] = [];
  const registered=await db.query<Person>("SELECT * FROM users WHERE status='active'");
  for (const person of data.people) {
    if (person.id) demand(existing.some(p=>p.id===person.id) && !ids.has(person.id),422,'Pessoa inválida nesta família');
    const entry = {...person,id:person.id ?? randomUUID()};
    ids.add(entry.id);
    if (entry.user_id) {
      demand(!users.has(entry.user_id),409,'Este membro já foi incluído nesta família');
      users.add(entry.user_id);
      const [user] = await db.query<Person>("SELECT * FROM users WHERE id=$1 AND status='active'",[entry.user_id]);
      demand(user,422,'Selecione um membro ativo');
      const [other] = await db.query<{name:string}>(`SELECT f.name FROM family_people p JOIN families f ON f.id=p.family_id WHERE p.user_id=$1 AND p.family_id<>$2`,[entry.user_id,familyId]);
      demand(!other,409,`Este membro já pertence à família ${other?.name}. Use a opção de unir famílias.`);
      entry.name=user.name; entry.birthday=user.birthday ?? null;
    }
    const name=normalizeFamilyName(entry.name);
    if (!entry.user_id) {
      const member=registered.find(u=>normalizeFamilyName(u.name)===name && (!u.birthday || !entry.birthday || u.birthday===entry.birthday));
      demand(!member,409,`${entry.name} já possui cadastro de membro. Vincule o cadastro existente em vez de repetir a pessoa.`);
    }
    demand(!names.has(name),409,`${entry.name} já aparece nesta família. Utilize um único cadastro para esta pessoa.`);
    names.add(name);
    // A child registered outside the family must be reviewed before creating another entry.
    if (entry.relationship==='child') {
      const candidates = await db.query<{name:string;birthday:string|null;family_name:string}>(`SELECT coalesce(u.name,p.name) AS name,
        CASE WHEN p.user_id IS NOT NULL THEN u.birthday ELSE p.birthday END AS birthday,f.name AS family_name
        FROM family_people p JOIN families f ON f.id=p.family_id LEFT JOIN users u ON u.id=p.user_id
        WHERE p.relationship='child' AND p.family_id<>$1`,[familyId]);
      const duplicate=candidates.find(p=>normalizeFamilyName(p.name)===name && (!p.birthday || !entry.birthday || p.birthday===entry.birthday));
      demand(!duplicate,409,`${entry.name} já consta em ${duplicate?.family_name}. Localize o cadastro e una as famílias para não duplicar o filho(a).`);
    }
    people.push(entry);
  }
  const parents=people.filter(p=>p.relationship==='parent');
  demand(parents.length>=1 && parents.length<=2,422,'A família deve ter um ou dois responsáveis; esposo(a) é opcional');
  await db.query('UPDATE families SET name=$2 WHERE id=$1',[familyId,data.name]);
  await db.query('DELETE FROM family_people WHERE family_id=$1',[familyId]);
  for (const p of people) await db.query('INSERT INTO family_people(id,family_id,user_id,relationship,name,birthday) VALUES($1,$2,$3,$4,$5,$6)',[p.id,familyId,p.user_id,p.relationship,p.name,p.birthday]);
  return (await listFamilies(db)).find(f=>f.id===familyId)!;
}

export async function listBirthdays(db: Database): Promise<Birthday[]> {
  const users=await db.query<Person>("SELECT * FROM users WHERE status='active' ORDER BY name");
  const families=await listFamilies(db);
  const birthdays: Birthday[]=users.filter(u=>u.birthday).map(u=>({member_id:u.id,member_name:u.name,name:u.name,relationship:'member',birthday:u.birthday!,sector_ids:u.sector_ids,
    family_name:families.find(f=>f.people.some(p=>p.user_id===u.id))?.name}));
  for (const family of families) {
    const memberIds=family.people.map(p=>p.user_id);
    const sectorIds=[...new Set(users.filter(u=>memberIds.includes(u.id)).flatMap(u=>u.sector_ids))];
    for (const person of family.people) if (!person.user_id && person.birthday && !users.some(u=>u.birthday===person.birthday && normalizeFamilyName(u.name)===normalizeFamilyName(person.name))) birthdays.push({member_id:person.id,member_name:family.name,name:person.name,
      birthday:person.birthday,relationship:person.relationship==='child'?'child':'spouse',sector_ids:sectorIds,family_name:family.name});
  }
  return birthdays.sort((a,b)=>a.birthday.localeCompare(b.birthday)||a.name.localeCompare(b.name,'pt-BR'));
}

export function registerFamilyRoutes(api: Router, db: Database) {
  api.use('/families',async(req,_res,next)=> {
    try {requireCoordinator(await currentUser(db,req));next();} catch(error) {next(error);}
  });
  api.get('/families/member-options',async(_req,res)=> {
    res.json(await db.query(`SELECT u.id,u.name,u.birthday,f.id AS family_id,f.name AS family_name FROM users u
      LEFT JOIN family_people p ON p.user_id=u.id LEFT JOIN families f ON f.id=p.family_id WHERE u.status='active' ORDER BY u.name`));
  });
  api.get('/families',async(_req,res)=>res.json(await listFamilies(db)));
  api.post('/families',async(req,res)=> {
    const data=familyInputSchema.parse(req.body);
    const family=await db.transaction(async tx=> {
      await lockFamilies(tx);
      const familyId=randomUUID();
      await tx.query('INSERT INTO families(id,name) VALUES($1,$2)',[familyId,data.name]);
      return saveFamily(tx,familyId,data);
    });
    res.status(201).json(family);
  });
  api.put('/families/:id',async(req,res)=> {
    const familyId=uuid(req.params.id),data=familyInputSchema.parse(req.body);
    res.json(await db.transaction(async tx=> {
      await lockFamilies(tx);
      demand((await tx.query('SELECT id FROM families WHERE id=$1',[familyId])).length,404,'Família não encontrada');
      return saveFamily(tx,familyId,data);
    }));
  });
  api.post('/families/:id/merge',async(req,res)=> {
    const targetId=uuid(req.params.id),sourceId=uuid(req.body.source_id);
    demand(targetId!==sourceId,422,'Selecione outra família para unir');
    const family=await db.transaction(async tx=> {
      await lockFamilies(tx);
      const all=await listFamilies(tx),target=all.find(f=>f.id===targetId),source=all.find(f=>f.id===sourceId);
      demand(target && source,404,'Família não encontrada');
      const combined=[...target.people];
      for (const person of source.people) {
        const same=combined.find(p=>(p.user_id && p.user_id===person.user_id) || (p.relationship===person.relationship && normalizeFamilyName(p.name)===normalizeFamilyName(person.name)));
        if (same) {
          demand(!same.user_id || !person.user_id || same.user_id===person.user_id,409,'Há membros diferentes com o mesmo nome. Revise os cadastros antes de unir.');
          demand(!same.birthday || !person.birthday || same.birthday===person.birthday,409,`As datas de ${person.name} são diferentes. Corrija o aniversário antes de unir.`);
          same.user_id=same.user_id ?? person.user_id;
          same.birthday=same.birthday ?? person.birthday;
        } else combined.push({...person});
      }
      await tx.query('DELETE FROM families WHERE id=$1',[sourceId]);
      // Source IDs become new rows in the destination; existing destination IDs are preserved.
      return saveFamily(tx,targetId,{name:target.name,people:combined.map(p=>({...p,id:target.people.some(t=>t.id===p.id)?p.id:undefined}))});
    });
    res.json(family);
  });
  api.delete('/families/:id',async(req,res)=> {
    const familyId=uuid(req.params.id);
    await db.transaction(async tx=> {
      await lockFamilies(tx);
      demand((await tx.query('DELETE FROM families WHERE id=$1 RETURNING id',[familyId])).length,404,'Família não encontrada');
    });
    res.json({message:'Família removida. Os cadastros de membros foram preservados.'});
  });
}
