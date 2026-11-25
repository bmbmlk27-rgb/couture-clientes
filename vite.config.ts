/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleMelbet } from './server/melbetProxy';
import { resolveSupabaseEnv } from './server/supabaseEnv';

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

export default defineConfig(({ mode, command }) => {
  // Toutes les variables (fichiers .env + variables Cloudflare Pages), pas seulement VITE_*.
  const supabase = resolveSupabaseEnv({ ...loadEnv(mode, process.cwd(), ''), ...process.env });

  if (command === 'build' && mode !== 'test') {
    // Visible dans les logs de build Cloudflare Pages : diagnostic immédiat du mode démo.
    console.log(
      supabase.missing.length
        ? `\n[MLK] ⚠ Supabase NON configuré — le site sera en MODE DÉMO. Variables manquantes : ${supabase.missing.join(', ')}\n`
        : `\n[MLK] ✓ Supabase configuré (${supabase.urlFrom} → ${supabase.url}, clé : ${supabase.keyFrom})\n`,
    );
  }

  return {
    plugins: [react(), melbetRelay()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabase.url),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabase.key),
      'import.meta.env.VITE_SUPABASE_MISSING': JSON.stringify(supabase.missing.join(', ')),
    },
    test: { environment: 'node' },
  };
});
