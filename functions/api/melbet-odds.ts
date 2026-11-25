/**
 * Cloudflare Pages Function — relais Melbet, cotes 1X2 (GetGame).
 * Répond sur /api/melbet-odds?gameId=123 → { home, draw, away }.
 */
import { handleMelbet } from '../../server/melbetProxy';

export const onRequest = ({ request }: { request: Request }): Promise<Response> => handleMelbet(request);
