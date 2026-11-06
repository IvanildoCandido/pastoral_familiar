import { readFile, readdir } from 'node:fs/promises';
import { database, closeDatabase } from '../src/db.js';
try {
 await database.transaction(async tx=> {
  await tx.query('SELECT pg_advisory_xact_lock(773041)');
  await tx.query('CREATE TABLE IF NOT EXISTS pastoral_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const dir=new URL('../../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()) {
   const name=file.slice(0,-4);
   if((await tx.query('SELECT name FROM pastoral_migrations WHERE name=$1',[name])).length) continue;
   const [existing]=await tx.query<{table_name:string|null}>("SELECT to_regclass('public.users')::text AS table_name");
   if(name!=='001_initial' || !existing.table_name) await tx.query(await readFile(new URL(file,dir),'utf8'));
   await tx.query('INSERT INTO pastoral_migrations(name) VALUES ($1)',[name]);
   console.log('Migração registrada:',name);
  }
 });
} finally {await closeDatabase();}
