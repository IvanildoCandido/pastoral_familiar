import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Vercel pode iniciar o comando no workspace frontend. Toda compilação parte da raiz.
const root = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Execute este comando com npm run vercel-build.');
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^npm_config_(workspace|workspaces|include_workspace_root)$/i.test(key)) delete env[key];
}
function run(script: string) {
  const result = spawnSync(process.execPath, [npmCli!, 'run', script], {cwd: root, env, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('Compilando interface e API a partir da raiz do repositório.');
run('build');
// Valida o artefato antes de alterar o banco. Uma falha na migração impede o deploy.
console.log('Aplicando migrações pendentes no banco deste ambiente.');
run('db:migrate');

console.log('Configurando Supabase Storage e migrando imagens antigas.');
run('storage:setup');
