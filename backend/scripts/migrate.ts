import { readFile } from 'node:fs/promises';
import { database, closeDatabase } from '../src/db.js';
try {
  await database.transaction(async tx=> {
    await tx.query('SELECT pg_advisory_xact_lock(773041)');
    await tx.query('CREATE TABLE IF NOT EXISTS pastoral_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const name='001_initial';
    if ((await tx.query('SELECT name FROM pastoral_migrations WHERE name=$1',[name])).length) {
      console.log('Migração já aplicada.'); return;
    }
    // Permite registrar uma instalação feita anteriormente pelo SQL Editor.
    const [existing]=await tx.query<{table_name:string|null}>("SELECT to_regclass('public.users')::text AS table_name");
    if (existing.table_name) throw new Error('Tabelas já existem. Se executou o SQL pelo painel, não precisa rodar db:migrate.');
    await tx.query(await readFile(new URL('../../supabase/migrations/001_initial.sql',import.meta.url),'utf8'));
    await tx.query('INSERT INTO pastoral_migrations(name) VALUES ($1)',[name]);
    console.log('Migração aplicada.');
  });
} finally {await closeDatabase();}
