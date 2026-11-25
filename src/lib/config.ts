import { DEFAULT_AVG_LEAGUE_GOALS } from './predictionEngine';

/** Moyenne de buts de la ligue (normalisation du modèle). Surchargée par VITE_AVG_LEAGUE_GOALS. */
export const AVG_LEAGUE_GOALS: number = (() => {
  const v = Number(import.meta.env.VITE_AVG_LEAGUE_GOALS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_AVG_LEAGUE_GOALS;
})();
