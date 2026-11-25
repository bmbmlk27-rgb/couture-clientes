/**
 * Cloudflare Worker — relais API Melbet + site statique (dist/).
 *   /api/melbet/<endpoint>?…  → liste des matchs
 *   /api/melbet-odds?gameId=… → cotes 1X2
 * Toute autre route est servie depuis `dist` ; les routes inconnues (/admin…)
 * renvoient index.html (`not_found_handling = "single-page-application"`).
 */
import { handleMelbet } from '../server/melbetProxy';

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/melbet')) return handleMelbet(request);
    return env.ASSETS.fetch(request);
  },
};
