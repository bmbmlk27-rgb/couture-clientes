/**
 * Fonction serverless Netlify — relais API Melbet.
 * Servie directement sur /api/melbet/* (liste des matchs) et
 * /api/melbet-odds (cotes 1X2) grâce à `config.path`.
 */
import { handleMelbet } from '../../server/melbetProxy';

export default (request: Request) => handleMelbet(request);

export const config = { path: ['/api/melbet/*', '/api/melbet-odds', '/api/melbet-league'] };
