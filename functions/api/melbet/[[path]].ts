/**
 * Cloudflare Pages Function — relais API Melbet (liste des matchs).
 * Répond sur /api/melbet/<endpoint>?… (ex. /api/melbet/ChampsBySport?sportIds=85).
 */
import { handleMelbet } from '../../../server/melbetProxy';

export const onRequestGet = ({ request }: { request: Request }): Promise<Response> => handleMelbet(request);
