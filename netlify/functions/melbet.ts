/**
 * Fonction serverless Netlify — relais API Melbet.
 * Servie directement sur /api/melbet/* grâce à `config.path`.
 */
import { handleMelbetRequest } from '../../server/melbetProxy';

export default (request: Request) => handleMelbetRequest(request);

export const config = { path: '/api/melbet/*' };
