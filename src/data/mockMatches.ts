import type { Match } from '../lib/types';
import { BUNDESLIGA_TEAMS, GERMAN_LEAGUE, getSimulatedHistory } from './teams';
import { hashString, mulberry32 } from '../lib/rng';
import { calculateDoublePoisson } from '../lib/predictionEngine';
import type { Odds } from '../lib/odds';

const DEMO_MARGIN = 1.06; // marge bookmaker simulée : 6 %

/**
 * Cotes de démo cohérentes avec les profils des clubs (probabilités Double
 * Poisson + marge), légèrement bruitées comme un vrai marché.
 */
function demoOdds(home: string, away: string, rnd: () => number): Odds | undefined {
  const p = calculateDoublePoisson(getSimulatedHistory(home), getSimulatedHistory(away));
  if (!p) return undefined;
  const odd = (pct: number) => {
    const noisy = (pct / 100) * (0.92 + rnd() * 0.16);
    return Math.max(1.05, Math.round((1 / (noisy * DEMO_MARGIN)) * 100) / 100);
  };
  return { home: odd(p.probabilities.home), draw: odd(p.probabilities.draw), away: odd(p.probabilities.away) };
}

const ROUND_MS = 6 * 60 * 1000; // une journée virtuelle toutes les 6 minutes

/** Mélange de Fisher–Yates déterministe. */
function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Données de test : journée en cours + 2 prochaines journées (9 matchs chacune). */
export function generateMockMatches(now = Date.now()): Match[] {
  const currentSlot = Math.floor(now / ROUND_MS);
  const matches: Match[] = [];
  for (let r = 0; r < 3; r++) {
    const slot = currentSlot + r;
    const startsAt = slot * ROUND_MS;
    const rnd = mulberry32(hashString(`round-${slot}`));
    const order = shuffle(BUNDESLIGA_TEAMS, rnd);
    for (let k = 0; k < order.length; k += 2) {
      const home = order[k];
      const away = order[k + 1];
      // ~1 match sur 3 sans cotes : sa prédiction se base sur l'historique
      const withOdds = rnd() > 0.33;
      matches.push({
        id: `mock-${slot}-${k / 2}`,
        league: GERMAN_LEAGUE,
        home: { name: home.name, short: home.short, colors: home.colors },
        away: { name: away.name, short: away.short, colors: away.colors },
        startsAt,
        status: r === 0 ? 'live' : 'upcoming',
        odds: withOdds ? demoOdds(home.name, away.name, rnd) : undefined,
        origin: 'demo',
      });
    }
  }
  return matches;
}
