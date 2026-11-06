import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { demand, HttpError } from './auth.js';
import type { Database } from './db.js';

export const BRANDING_BUCKET = 'pastoral-branding';
export const IMAGE_LIMIT = 1024 * 1024;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export type ImageKind = 'hero' | 'logo';
export interface BrandingSettings {hero_url: string; logo_url: string}
export interface BrandingStorage {
  ensureBucket(): Promise<void>;
  upload(kind: ImageKind, bytes: Buffer, contentType: string): Promise<string>;
  remove(url: string): Promise<void>;
}

export function validateImage(bytes: unknown, contentType: string): asserts bytes is Buffer {
  demand(Buffer.isBuffer(bytes) && bytes.length > 0, 422, 'Envie um arquivo de imagem');
  demand(bytes.length <= IMAGE_LIMIT, 413, 'A imagem deve ter até 1 MB');
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 12 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
  demand((contentType === 'image/png' && png) || (contentType === 'image/jpeg' && jpeg) || (contentType === 'image/webp' && webp),
    422, 'Envie uma imagem PNG, JPEG ou WebP válida');
}

export function createBrandingStorage(env = process.env): BrandingStorage {
  const url = env.SUPABASE_URL?.replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  demand(url && key, 503, 'Upload indisponível: configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor');
  demand(/^https:\/\//.test(url), 503, 'SUPABASE_URL deve usar HTTPS');
  let role: unknown;
  if (key.split('.').length === 3) {
    try {role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;} catch { /* Supabase validates malformed keys. */ }
  }
  demand(!key.startsWith('sb_publishable_') && role !== 'anon' && role !== 'authenticated', 503,
    'SUPABASE_SERVICE_ROLE_KEY contém uma chave pública. Copie a chave service_role em Settings → API Keys → Legacy API Keys, ou use uma chave secreta sb_secret_.');
  const client = createClient(url, key, {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
    global: {fetch: (input, init) => fetch(input, {...init, signal: AbortSignal.timeout(15000)})}});
  const bucket = client.storage.from(BRANDING_BUCKET);
  const publicPrefix = `${url}/storage/v1/object/public/${BRANDING_BUCKET}/`;
  const fail = () => new HttpError(502, 'Não foi possível acessar o armazenamento de imagens. Tente novamente.');
  return {
    async ensureBucket() {
      const options = {public: true, fileSizeLimit: IMAGE_LIMIT, allowedMimeTypes: IMAGE_TYPES};
      const {data, error} = await client.storage.getBucket(BRANDING_BUCKET);
      if (error && !['404','400'].includes(String('statusCode' in error ? error.statusCode : ''))) throw fail();
      if (!data) {
        const created = await client.storage.createBucket(BRANDING_BUCKET, options);
        if (!created.error) return;
        // Another build may have created the same bucket in the meantime.
        if ((await client.storage.getBucket(BRANDING_BUCKET)).error) throw fail();
      }
      if ((await client.storage.updateBucket(BRANDING_BUCKET, options)).error) throw fail();
    },
    async upload(kind, bytes, contentType) {
      validateImage(bytes, contentType);
      const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
      const path = `${kind}/${randomUUID()}.${extension}`;
      const {error} = await bucket.upload(path, bytes, {contentType, cacheControl: '31536000', upsert: false});
      if (error) throw fail();
      return bucket.getPublicUrl(path).data.publicUrl;
    },
    async remove(imageUrl) {
      if (!imageUrl.startsWith(publicPrefix)) return;
      const path = imageUrl.slice(publicPrefix.length);
      // Only remove files created by this application, never another bucket or arbitrary URL.
      if (!/^(hero|logo)\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(path)) return;
      if ((await bucket.remove([path])).error) throw fail();
    },
  };
}

async function cleanup(storage: BrandingStorage, url: string) {
  try {await storage.remove(url);} catch {console.warn('Não foi possível remover uma imagem antiga do Storage.');}
}

export async function saveBrandingImage(db: Database, storage: BrandingStorage, kind: ImageKind, bytes: Buffer, contentType: string) {
  const column = kind === 'hero' ? 'hero_url' : 'logo_url';
  const url = await storage.upload(kind, bytes, contentType);
  let previous = '';
  let settings: BrandingSettings;
  try {
    settings = await db.transaction(async tx => {
      const [current] = await tx.query<BrandingSettings>('SELECT hero_url,logo_url FROM app_settings WHERE id=true FOR UPDATE');
      demand(current, 503, 'Execute as migrações do banco antes de enviar imagens');
      previous = current[column];
      const [saved] = await tx.query<BrandingSettings>(`UPDATE app_settings SET ${column}=$1 WHERE id=true RETURNING hero_url,logo_url`, [url]);
      return saved;
    });
  } catch (error) {await cleanup(storage, url); throw error;}
  if (previous && previous !== url && !Object.values(settings).includes(previous)) await cleanup(storage, previous);
  return settings;
}

export async function setupBrandingStorage(db: Database, storage: BrandingStorage = createBrandingStorage()) {
  await storage.ensureBucket();
  for (const kind of ['hero','logo'] as const) {
    const column = kind === 'hero' ? 'hero_url' : 'logo_url';
    // Lock settings so a concurrent upload cannot be overwritten by a legacy conversion.
    let uploadedUrl = '';
    try {await db.transaction(async tx => {
      const [settings] = await tx.query<BrandingSettings>('SELECT hero_url,logo_url FROM app_settings WHERE id=true FOR UPDATE');
      demand(settings, 503, 'Execute npm run db:migrate primeiro');
      const value = settings[column];
      if (!value.startsWith('data:')) return;
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
      demand(match, 422, 'Imagem antiga inválida; substitua a imagem antes de migrar');
      const bytes = Buffer.from(match[2], 'base64');
      validateImage(bytes, match[1]);
      uploadedUrl = await storage.upload(kind, bytes, match[1]);
      await tx.query(`UPDATE app_settings SET ${column}=$1 WHERE id=true`, [uploadedUrl]);
    });} catch (error) {
      if (uploadedUrl) await cleanup(storage, uploadedUrl);
      throw error;
    }
  }
}
