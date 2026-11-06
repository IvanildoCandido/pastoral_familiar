import { database, closeDatabase } from '../src/db.js';
import { setupBrandingStorage } from '../src/storage.js';
try {
  await setupBrandingStorage(database);
  console.log('Supabase Storage configurado: bucket pastoral-branding e imagens antigas migradas.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha ao configurar o Storage');
  process.exitCode = 1;
} finally {await closeDatabase();}
