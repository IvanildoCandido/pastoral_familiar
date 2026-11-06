import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite, type Transaction} from '@electric-sql/pglite';
import {createBrandingStorage, setupBrandingStorage, saveBrandingImage, validateImage, BRANDING_BUCKET, IMAGE_LIMIT, type BrandingStorage} from '../src/storage.js';
import type {Database} from '../src/db.js';

const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
function adapter(engine:PGlite|Transaction):Database {
  return {
    query:async <T>(sql:string,params?:unknown[])=>(await engine.query<T>(sql,params)).rows,
    transaction:run=>'transaction' in engine ? engine.transaction(tx=>run(adapter(tx))) : run(adapter(engine)),
  };
}

test('Storage: configuração, upload binário, cache e exclusão restrita ao bucket',async t=> {
  const originalFetch=globalThis.fetch;
  t.after(()=>{globalThis.fetch=originalFetch;});
  const calls:{method:string;path:string;body:unknown;headers:Headers}[]=[];
  let exists=false, denied=false;
  globalThis.fetch=async (input,init)=>{
    const method=init?.method || 'GET', path=new URL(String(input)).pathname;
    calls.push({method,path,body:init?.body,headers:new Headers(init?.headers)});
    if(denied) return Response.json({statusCode:'403',error:'Forbidden',message:'Denied'},{status:403});
    if(method==='GET' && path===`/storage/v1/bucket/${BRANDING_BUCKET}`) {
      return exists ? Response.json({id:BRANDING_BUCKET,name:BRANDING_BUCKET,public:true}) : Response.json({statusCode:'404',error:'not_found',message:'Bucket not found'},{status:404});
    }
    if(method==='POST' && path==='/storage/v1/bucket') exists=true;
    return Response.json({Key:'ok'});
  };
  const storage=createBrandingStorage({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-server-key'});
  await storage.ensureBucket(); await storage.ensureBucket();
  assert.equal(calls.filter(c=>c.method==='POST' && c.path==='/storage/v1/bucket').length,1);
  const bucketOptions=JSON.parse(String(calls.find(c=>c.path==='/storage/v1/bucket')?.body));
  assert.equal(bucketOptions.public,true);assert.equal(bucketOptions.file_size_limit,IMAGE_LIMIT);
  assert.deepEqual(bucketOptions.allowed_mime_types,['image/png','image/jpeg','image/webp']);
  const url=await storage.upload('hero',image,'image/png');
  assert.match(url,/^https:\/\/example\.supabase\.co\/storage\/v1\/object\/public\/pastoral-branding\/hero\/[a-f0-9-]+\.png$/);
  const upload=calls.find(c=>c.method==='POST' && c.path.includes('/object/'))!;
  assert.ok(Buffer.isBuffer(upload.body));assert.equal(upload.headers.get('cache-control'),'max-age=31536000');
  assert.equal(upload.headers.get('x-upsert'),'false');
  assert.equal(upload.headers.get('authorization'),'Bearer test-server-key');
  const before=calls.length;
  await storage.remove('https://attacker.example/file.png');
  await storage.remove('https://example.supabase.co/storage/v1/object/public/another-bucket/a.png');
  assert.equal(calls.length,before);
  await storage.remove(url);assert.equal(calls.at(-1)?.method,'DELETE');
  denied=true;await assert.rejects(storage.ensureBucket(),/armazenamento/);
  await assert.rejects(storage.upload('hero',image,'image/png'),/armazenamento/);
  assert.throws(()=>createBrandingStorage({}),/SUPABASE_URL/);
  const publicJwt=`test.${Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')}.test`;
  assert.throws(()=>createBrandingStorage({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:publicJwt}),/chave pública/);
  assert.throws(()=>createBrandingStorage({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_publishable_test'}),/chave pública/);

  assert.throws(()=>validateImage(Buffer.from('<svg/>'),'image/png'),/válida/);
  assert.throws(()=>validateImage(image,'image/jpeg'),/válida/);
});

test('Storage: migra Base64 uma vez e remove arquivo novo quando o banco falha',async t=> {
  const engine=new PGlite();t.after(()=>engine.close());
  await engine.exec(await readFile(new URL('../../supabase/migrations/001_initial.sql',import.meta.url),'utf8'));
  await engine.exec(await readFile(new URL('../../supabase/migrations/002_event_identity_sectors.sql',import.meta.url),'utf8'));
  const db=adapter(engine),files=new Map<string,Buffer>();
  let uploaded=0;
  const storage:BrandingStorage={
    ensureBucket:async()=>{},
    upload:async(kind,bytes)=>{const url=`https://example.supabase.co/${kind}/${++uploaded}.png`;files.set(url,bytes);return url;},
    remove:async url=>{files.delete(url);},
  };
  await db.query('UPDATE app_settings SET hero_url=$1,logo_url=$1',[`data:image/png;base64,${image.toString('base64')}`]);
  await setupBrandingStorage(db,storage);
  await setupBrandingStorage(db,storage);
  assert.equal(uploaded,2);assert.equal(files.size,2);
  const [settings]=await db.query('SELECT * FROM app_settings');
  assert.ok(settings.hero_url.startsWith('https:'));assert.ok(settings.logo_url.startsWith('https:'));
  const failedDb:Database={...db,transaction:async()=>{throw new Error('database unavailable');}};
  await assert.rejects(saveBrandingImage(failedDb,storage,'hero',image,'image/png'),/database unavailable/);
  assert.equal(files.size,2);
  assert.equal((await db.query('SELECT hero_url FROM app_settings'))[0].hero_url,settings.hero_url);
});
