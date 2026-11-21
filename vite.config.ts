/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    // The preview proxy serves the app from a dynamic subdomain, so the dev
    // server must accept that origin rather than only localhost.
    allowedHosts: true,
    strictPort: false,
  },
  preview: { host: '0.0.0.0', port: 4173 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
