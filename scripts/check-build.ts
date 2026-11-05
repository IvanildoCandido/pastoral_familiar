import { access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
// Verifique os artefatos reais. A Vercel pode normalizar a configuração durante o build.
const output = new URL('dist/', root);
await access(new URL('index.html', output));
await access(new URL('pastoral.svg', output));
await access(new URL('api/index.ts', root));
console.log('Build verificado: dist/index.html e entrada da API disponíveis.');
