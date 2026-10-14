import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// BASE_PATH ('/' prod, '/dev/' dev) and VITE_API_BASE are injected by the Pages
// workflow at build time. Locally they default to '/' and the wrangler dev URL.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
});
