import { access, readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
const output = new URL(`${config.outputDirectory}/`, root);
await access(new URL('index.html', output));
await access(new URL('pastoral.svg', output));
await access(new URL('api/index.ts', root));
console.log(`Build verificado: ${config.outputDirectory}/index.html e entrada da API disponíveis.`);
