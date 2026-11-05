import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  build: {outDir: path.resolve(root, 'dist'), emptyOutDir: true},
  plugins: [react(), tailwindcss()],
  resolve: {alias: {'@': path.resolve(root, 'src')}},
  // Preserve o Host do navegador para a API validar a origem através do proxy local.
  server: {host:'127.0.0.1',port:3000,proxy:{'/api': {target:'http://127.0.0.1:8001', changeOrigin:false}}},
});
