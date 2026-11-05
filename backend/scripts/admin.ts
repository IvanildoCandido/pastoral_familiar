import { randomUUID } from 'node:crypto';
import { database, closeDatabase } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import { memberSchema } from '../src/models.js';
try {
  const body=memberSchema.parse({username:process.env.ADMIN_USERNAME || 'admin',password:process.env.ADMIN_PASSWORD,
    name:process.env.ADMIN_NAME || 'Coordenador Geral',role:'coordenador'});
  if (body.password.length<12 || body.password==='SUBSTITUA_POR_UMA_SENHA_FORTE') throw new Error('Defina ADMIN_PASSWORD com pelo menos 12 caracteres.');
  await database.query(`INSERT INTO users (id,username,password_hash,name,role,status) VALUES ($1,$2,$3,$4,'coordenador','active')`,
    [randomUUID(),body.username,await hashPassword(body.password),body.name]);
  console.log(`Coordenador ${body.username} criado. Nenhuma senha foi exibida.`);
} finally {await closeDatabase();}
