/**
 * Fonction serverless Vercel — relais API Melbet.
 * `vercel.json` réécrit /api/melbet/<endpoint>?… vers /api/melbet?path=<endpoint>&…
 */
import { handleMelbetRequest } from '../server/melbetProxy';

export function GET(request: Request): Promise<Response> {
  return handleMelbetRequest(request);
}
