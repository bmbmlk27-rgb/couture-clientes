import { motion } from 'framer-motion';
import type { Team } from '../lib/types';

/**
 * Écusson généré (SVG) aux couleurs du club, avec halo lumineux.
 * Aucun logo officiel n'est embarqué.
 */
export function TeamCrest({ team, size = 64, side }: { team: Team; size?: number; side: 'home' | 'away' }) {
  const [c1, c2] = team.colors;
  const id = `crest-${team.short}-${side}`;
  return (
    <motion.div
      className="relative"
      style={{ width: size, height: size }}
      whileHover={{ scale: 1.08, rotate: side === 'home' ? -4 : 4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
    >
      <div
        className="absolute inset-0 rounded-full opacity-60 blur-xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: c1 }}
        aria-hidden
      />
      {team.logoUrl ? (
        <img
          src={team.logoUrl}
          alt={`Logo ${team.name}`}
          width={size}
          height={size}
          loading="lazy"
          className="relative h-full w-full object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,.6)]"
        />
      ) : (
      <svg viewBox="0 0 64 72" width={size} height={size * 1.125} className="relative -mt-[6%]" role="img" aria-label={`Écusson ${team.name}`}>
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={c1} />
            <stop offset="1" stopColor={shade(c1, -35)} />
          </linearGradient>
        </defs>
        <path d="M32 3 59 12v22c0 17-12 29-27 35C17 63 5 51 5 34V12z" fill={`url(#${id}-g)`} stroke={c2} strokeWidth="3" />
        <path d="M32 3 59 12v22c0 17-12 29-27 35z" fill="#000" opacity=".14" />
        <text
          x="32" y="43" textAnchor="middle"
          fontFamily="Chakra Petch, sans-serif" fontWeight="700" fontSize={team.short.length > 3 ? 13 : 16}
          fill={readable(c1)} letterSpacing=".5"
        >
          {team.short}
        </text>
      </svg>
      )}
    </motion.div>
  );
}

function shade(hex: string, pct: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * 255)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function readable(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? '#0a1124' : '#ffffff';
}
