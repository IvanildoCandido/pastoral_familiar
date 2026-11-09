import type { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from './db.js';
import { currentUser, demand, requireCoordinator } from './auth.js';
import { familyInformationSchema } from './models.js';
import { familyInputSchema, listFamilies, lockFamilies, saveFamily } from './families.js';
import type { FamilyInformation, FamilyRequest } from '../../shared/types.js';

export async function submitFamilyInformation(db: Database, memberId: string, information: FamilyInformation) {
  const [row]=await db.query<{id:string}>(`INSERT INTO family_requests(id,submitted_by,information,revision)
    VALUES($1,$2,$3,$4) ON CONFLICT (submitted_by) WHERE status='pending'
    DO UPDATE SET information=EXCLUDED.information,revision=EXCLUDED.revision,updated_at=now() RETURNING id`,
    [randomUUID(),memberId,JSON.stringify(information),randomUUID()]);
  return row.id;
}
const requestSql=`SELECT r.*,u.name AS submitted_by_name,u.status AS submitter_status FROM family_requests r JOIN users u ON u.id=r.submitted_by`;
const reviewSchema=z.object({revision:z.string().uuid(),note:z.string().trim().max(1000).default('')});

export function registerFamilyRequestRoutes(api:Router,db:Database) {
  api.get('/family-requests/mine',async(req,res)=> {
    const principal=await currentUser(db,req);
    const requests=await db.query<FamilyRequest>(`${requestSql} WHERE r.submitted_by=$1 ORDER BY r.updated_at DESC,r.id`,[principal.id]);
    const family=(await listFamilies(db)).find(f=>f.people.some(p=>p.user_id===principal.id)) ?? null;
    res.json({requests,family});
  });
  api.post('/family-requests',async(req,res)=> {
    const principal=await currentUser(db,req),information=familyInformationSchema.parse(req.body);
    demand(!information.people.some(p=>p.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()===principal.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()),422,'Seus próprios dados já estão no cadastro; informe apenas seus familiares');
    const requestId=await submitFamilyInformation(db,principal.id,information);
    res.status(201).json({message:'Informações enviadas para revisão do coordenador',id:requestId});
  });
  api.get('/families/requests',async(req,res)=> {
    requireCoordinator(await currentUser(db,req));
    const status=z.enum(['pending','approved','rejected']).parse(req.query.status ?? 'pending');
    res.json(await db.query<FamilyRequest>(`${requestSql} WHERE r.status=$1 ORDER BY r.created_at,r.id`,[status]));
  });
  api.post('/families/requests/:id/approve',async(req,res)=> {
    const principal=await currentUser(db,req);requireCoordinator(principal);
    const requestId=z.string().uuid().parse(req.params.id);
    const body=reviewSchema.extend({family_id:z.string().uuid().nullable(),family:familyInputSchema}).parse(req.body);
    const result=await db.transaction(async tx=> {
      await lockFamilies(tx);
      const [request]=await tx.query<FamilyRequest>(`${requestSql} WHERE r.id=$1 FOR UPDATE OF r`,[requestId]);
      demand(request,404,'Solicitação não encontrada');
      demand(request.status==='pending' && request.revision===body.revision,409,'A solicitação foi alterada ou já foi revisada. Atualize a lista e confira os dados novamente.');
      demand(request.submitter_status==='active',409,'Aprove primeiro o cadastro de acesso deste membro');
      demand(body.family.people.some(p=>p.user_id===request.submitted_by),422,'A família revisada deve incluir o membro que enviou as informações');
      const familyId=body.family_id ?? randomUUID();
      if(body.family_id) demand((await tx.query('SELECT id FROM families WHERE id=$1',[familyId])).length,404,'Família não encontrada');
      else await tx.query('INSERT INTO families(id,name) VALUES($1,$2)',[familyId,body.family.name]);
      const family=await saveFamily(tx,familyId,body.family);
      await tx.query(`UPDATE family_requests SET status='approved',reviewed_at=now(),reviewed_by=$2,review_note=$3,family_id=$4 WHERE id=$1`,[requestId,principal.id,body.note,family.id]);
      return family;
    });
    res.json(result);
  });
  api.post('/families/requests/:id/reject',async(req,res)=> {
    const principal=await currentUser(db,req);requireCoordinator(principal);
    const requestId=z.string().uuid().parse(req.params.id),body=reviewSchema.parse(req.body);
    demand(body.note.length>=2,422,'Informe o motivo para o membro corrigir os dados');
    const updated=await db.query(`UPDATE family_requests SET status='rejected',reviewed_at=now(),reviewed_by=$2,review_note=$3
      WHERE id=$1 AND status='pending' AND revision=$4 RETURNING id`,[requestId,principal.id,body.note,body.revision]);
    demand(updated.length,409,'A solicitação foi alterada ou já foi revisada. Atualize a lista.');
    res.json({message:'Solicitação devolvida para correção'});
  });
}
