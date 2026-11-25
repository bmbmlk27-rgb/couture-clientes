/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleMelbet } from './server/melbetProxy';

/**
 * En dev (`npm run dev`) et en `npm run preview`, les routes /api/melbet/* et
 * /api/melbet-odds sont servies par EXACTEMENT le même code que les fonctions
 * serverless de production (server/melbetProxy.ts).
 */
function melbetRelay(): Plugin {
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? '';
    if (!/^\/api\/melbet(-odds)?(\/|\?|$)/.test(url)) return next();
    try {
      const response = await handleMelbet(new Request(`http://localhost${url}`, { method: req.method }));
      res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(e) }));
    }
  };
  return {
    name: 'melbet-relay',
    configureServer: (server) => { server.middlewares.use(middleware); },
    configurePreviewServer: (server) => { server.middlewares.use(middleware); },
  };
}

export default defineConfig({
  plugins: [react(), melbetRelay()],
  test: { environment: 'node' },
});
