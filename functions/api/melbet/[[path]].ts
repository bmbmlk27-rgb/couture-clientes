/**
 * Cloudflare Pages Function — relais API Melbet (liste des matchs).
 * Répond sur /api/melbet/* (ex. /api/melbet/ChampsBySport?sportIds=85).
 * Même code que Vercel / Netlify / dev : server/melbetProxy.ts.
 */
import { handleMelbet } from '../../../server/melbetProxy';

export const onRequestGet = ({ request }: { request: Request }) => handleMelbet(request);
