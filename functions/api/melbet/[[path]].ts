/**
 * Cloudflare Pages Function — relais Melbet, liste des matchs.
 * Répond sur /api/melbet/<endpoint>?… (ex. /api/melbet/ChampsBySport?sportIds=85).
 * Le nom de l'endpoint est lu dans le chemin par server/melbetProxy.ts.
 */
import { handleMelbet } from '../../../server/melbetProxy';

export const onRequest = ({ request }: { request: Request }): Promise<Response> => handleMelbet(request);
