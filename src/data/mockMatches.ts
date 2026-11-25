import type { Match } from '../lib/types';
import { BUNDESLIGA_TEAMS, GERMAN_LEAGUE } from './teams';
import { hashString, mulberry32 } from '../lib/rng';

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
      const odd = () => Math.round((1.4 + rnd() * 3.2) * 100) / 100;
      matches.push({
        id: `mock-${slot}-${k / 2}`,
        league: GERMAN_LEAGUE,
        home: { name: home.name, short: home.short, colors: home.colors },
        away: { name: away.name, short: away.short, colors: away.colors },
        startsAt,
        status: r === 0 ? 'live' : 'upcoming',
        odds: { home: odd(), draw: Math.round((3 + rnd() * 1.5) * 100) / 100, away: odd() },
      });
    }
  }
  return matches;
}
