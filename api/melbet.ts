/**
 * Fonction serverless Vercel — relais API Melbet (deux routes).
 * `vercel.json` réécrit :
 *   /api/melbet/<endpoint>?…  → /api/melbet?path=<endpoint>&…   (liste des matchs)
 *   /api/melbet-odds?gameId=… → /api/melbet?route=odds&gameId=… (cotes 1X2)
 */
import { handleMelbet } from '../server/melbetProxy';

export function GET(request: Request): Promise<Response> {
  return handleMelbet(request);
}
