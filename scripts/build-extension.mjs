import { cp, mkdir, rm } from 'node:fs/promises';
await rm('extension-dist', { recursive: true, force: true });
await mkdir('extension-dist', { recursive: true });
await cp('dist', 'extension-dist', { recursive: true });
await cp('extension', 'extension-dist', { recursive: true });
console.log('Unpacked Chrome extension: extension-dist/');
