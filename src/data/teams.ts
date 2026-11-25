import type { Team } from '../lib/types';
import type { TeamHistory } from '../lib/predictionEngine';
import { hashString, mulberry32, samplePoisson } from '../lib/rng';

export const GERMAN_LEAGUE = 'FC 26. Championnat d\'Allemagne';

interface TeamProfile extends Team {
  /** Buts marqués / encaissés moyens utilisés pour simuler l'historique de démo. */
  attack: number;
  defense: number;
  aliases?: string[];
}

export const BUNDESLIGA_TEAMS: TeamProfile[] = [
  { name: 'Bayern Munich', short: 'FCB', colors: ['#dc052d', '#0066b2'], attack: 2.6, defense: 0.8, aliases: ['bayern', 'fc bayern'] },
  { name: 'Borussia Dortmund', short: 'BVB', colors: ['#fde100', '#1a1a1a'], attack: 2.1, defense: 1.2, aliases: ['dortmund'] },
  { name: 'Bayer Leverkusen', short: 'B04', colors: ['#e32221', '#1a1a1a'], attack: 2.2, defense: 1.0, aliases: ['leverkusen'] },
  { name: 'RB Leipzig', short: 'RBL', colors: ['#dd0741', '#ffffff'], attack: 2.0, defense: 1.1, aliases: ['leipzig'] },
  { name: 'VfB Stuttgart', short: 'VFB', colors: ['#e32219', '#ffffff'], attack: 1.9, defense: 1.3, aliases: ['stuttgart'] },
  { name: 'Eintracht Francfort', short: 'SGE', colors: ['#e1000f', '#1a1a1a'], attack: 1.8, defense: 1.3, aliases: ['francfort', 'frankfurt', 'eintracht'] },
  { name: 'SC Fribourg', short: 'SCF', colors: ['#e2001a', '#1a1a1a'], attack: 1.5, defense: 1.3, aliases: ['fribourg', 'freiburg'] },
  { name: 'VfL Wolfsburg', short: 'WOB', colors: ['#65b32e', '#ffffff'], attack: 1.5, defense: 1.5, aliases: ['wolfsburg'] },
  { name: 'Borussia Mönchengladbach', short: 'BMG', colors: ['#1a1a1a', '#00a650'], attack: 1.6, defense: 1.6, aliases: ['gladbach', 'monchengladbach', 'mönchengladbach'] },
  { name: 'Union Berlin', short: 'FCU', colors: ['#eb1923', '#fdd100'], attack: 1.2, defense: 1.3, aliases: ['union'] },
  { name: 'Werder Brême', short: 'SVW', colors: ['#1d9053', '#ffffff'], attack: 1.6, defense: 1.7, aliases: ['werder', 'breme', 'bremen'] },
  { name: 'TSG Hoffenheim', short: 'TSG', colors: ['#1c63b7', '#ffffff'], attack: 1.7, defense: 1.8, aliases: ['hoffenheim'] },
  { name: 'FC Augsbourg', short: 'FCA', colors: ['#ba3733', '#46714d'], attack: 1.3, defense: 1.6, aliases: ['augsbourg', 'augsburg'] },
  { name: 'Mayence 05', short: 'M05', colors: ['#c3141e', '#ffffff'], attack: 1.4, defense: 1.4, aliases: ['mayence', 'mainz'] },
  { name: 'FC Heidenheim', short: 'FCH', colors: ['#e2001a', '#003b79'], attack: 1.2, defense: 1.8, aliases: ['heidenheim'] },
  { name: 'FC St. Pauli', short: 'STP', colors: ['#6b4425', '#ffffff'], attack: 1.0, defense: 1.5, aliases: ['st pauli', 'st. pauli', 'pauli'] },
  { name: 'Hambourg SV', short: 'HSV', colors: ['#0a3f86', '#ffffff'], attack: 1.3, defense: 1.7, aliases: ['hambourg', 'hamburg', 'hsv'] },
  { name: 'FC Cologne', short: 'KOE', colors: ['#ed1c24', '#ffffff'], attack: 1.3, defense: 1.8, aliases: ['cologne', 'koln', 'köln'] },
];

const FALLBACK_COLORS: [string, string][] = [
  ['#39ff88', '#0a1124'], ['#f5c542', '#0a1124'], ['#4cc9f0', '#0a1124'],
  ['#ff4d6d', '#0a1124'], ['#b388ff', '#0a1124'], ['#ff9f1c', '#0a1124'],
];

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)/g, '').trim();

function findProfile(name: string): TeamProfile | undefined {
  const n = norm(name);
  return BUNDESLIGA_TEAMS.find(
    (t) => norm(t.name) === n || t.aliases?.some((a) => n.includes(norm(a))),
  );
}

/** Retrouve un club connu ou fabrique une identité visuelle stable à partir du nom. */
export function resolveTeam(name: string): Team {
  const p = findProfile(name);
  if (p) return { name: p.name, short: p.short, colors: p.colors };
  const clean = name.replace(/\(.*?\)/g, '').trim() || name;
  const initials = clean.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  return {
    name: clean,
    short: initials || '???',
    colors: FALLBACK_COLORS[hashString(clean) % FALLBACK_COLORS.length],
  };
}

/**
 * Historique des 10 derniers matchs d'une équipe.
 * ⚠ L'API ne fournit pas d'historique : il est simulé de façon déterministe
 * à partir du profil du club (données de démonstration).
 */
export function getTeamHistory(name: string, games = 10): TeamHistory {
  const p = findProfile(name);
  const seed = hashString(norm(name));
  const rnd = mulberry32(seed);
  const attack = p?.attack ?? 1.2 + (seed % 100) / 100;
  const defense = p?.defense ?? 1.2 + ((seed >>> 8) % 100) / 100;
  const goalsScored: number[] = [];
  const goalsConceded: number[] = [];
  for (let i = 0; i < games; i++) {
    goalsScored.push(samplePoisson(attack, rnd));
    goalsConceded.push(samplePoisson(defense, rnd));
  }
  return { goalsScored, goalsConceded };
}
