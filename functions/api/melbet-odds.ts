/**
 * Cloudflare Pages Function — cotes 1X2 d'un match (GetGame).
 * Répond sur /api/melbet-odds?gameId=123 → { home, draw, away }.
 */
import { handleMelbet } from '../../server/melbetProxy';

export const onRequestGet = ({ request }: { request: Request }) => handleMelbet(request);
