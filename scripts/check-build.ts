import { access, cp } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const frontendOutput = new URL('frontend/dist/', root);
await access(new URL('index.html', frontendOutput));
await access(new URL('pastoral.svg', frontendOutput));
await access(new URL('frontend/api/index.ts', root));
// As duas raízes de publicação têm dist/ e api/, sem depender da seleção de workspace.
await cp(frontendOutput, new URL('dist/', root), {recursive: true, force: true});
await access(new URL('api/index.ts', root));
console.log('Build verificado: frontend/dist, dist e entradas da API disponíveis.');
