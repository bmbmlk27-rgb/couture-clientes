import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Clock, Radio, Sigma, Trophy, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { MatchWithPrediction } from '../lib/types';
import { TeamCrest } from './TeamCrest';
import { ScoreCountUp } from './CountUp';
import { ConfidenceRing } from './ConfidenceRing';

export const cardVariants = {
  hidden: { opacity: 0, y: 28, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 120, damping: 18 } },
};

const avg = (a: number[]) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '–');

function StatusPill({ m }: { m: MatchWithPrediction }) {
  if (m.status === 'live')
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-danger/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-danger">
        <Radio className="h-3 w-3 animate-pulse" /> En direct
      </span>
    );
  if (m.status === 'finished')
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <CheckCircle2 className="h-3 w-3" /> Terminé
      </span>
    );
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-neon/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-neon">
      <Clock className="h-3 w-3" />
      {new Date(m.startsAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

export function MatchCard({ match, index }: { match: MatchWithPrediction; index: number }) {
  const p = match.prediction;
  const delay = 0.25 + (index % 9) * 0.05;

  // Inclinaison 3D qui suit le pointeur
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(my, [0, 1], [7, -7]), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useTransform(mx, [0, 1], [-7, 7]), { stiffness: 200, damping: 20 });
  const glowX = useTransform(mx, (v) => `${v * 100}%`);
  const glowY = useTransform(my, (v) => `${v * 100}%`);
  const spotlight = useMotionTemplate`radial-gradient(420px circle at ${glowX} ${glowY}, rgba(57,255,136,.12), transparent 45%)`;

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  };
  const onLeave = () => { mx.set(0.5); my.set(0.5); };

  const winnerName =
    p?.winner === 'Domicile' ? match.home.name : p?.winner === 'Extérieur' ? match.away.name : 'Match nul';

  return (
    <motion.article
      variants={cardVariants}
      layout
      className="group min-w-0 [perspective:1000px]"
    >
      <motion.div
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        whileHover={{ y: -8 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        className="relative h-full overflow-hidden rounded-2xl border border-white/[.07] bg-night-800/60 shadow-card backdrop-blur-xl transition-[box-shadow,border-color] duration-500 hover:border-neon/50 hover:shadow-card-hover"
      >
        {/* Projecteur suivant la souris */}
        <motion.div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: spotlight }} />
        {/* Liseré lumineux supérieur */}
        <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-neon/60 to-transparent opacity-40 transition-opacity group-hover:opacity-100" />

        <div className="relative p-5">
          <header className="mb-5 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] font-medium uppercase tracking-[.14em] text-slate-400">
              <Trophy className="h-3.5 w-3.5 shrink-0 text-gold" />
              <span className="truncate">{match.league}</span>
            </span>
            <StatusPill m={match} />
          </header>

          {/* Duel */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2" style={{ transform: 'translateZ(30px)' }}>
            <TeamBlock m={match} side="home" />
            <div className="relative grid place-items-center">
              <span className="font-display text-2xl font-bold italic text-transparent [-webkit-text-stroke:1px_rgba(255,255,255,.35)] transition-all duration-500 group-hover:[-webkit-text-stroke:1px_#39ff88] group-hover:drop-shadow-[0_0_10px_rgba(57,255,136,.8)]">
                VS
              </span>
            </div>
            <TeamBlock m={match} side="away" />
          </div>

          {match.odds && (
            <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-[11px]">
              {([['1', match.odds.home], ['N', match.odds.draw], ['2', match.odds.away]] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between rounded-md bg-white/[.03] px-2 py-1 text-slate-400">
                  <span>{k}</span>
                  <span className="text-slate-200">{v ? v.toFixed(2) : '—'}</span>
                </div>
              ))}
            </div>
          )}

          {/* Prédiction */}
          {p ? (
            <div className="mt-5 rounded-xl border border-white/[.06] bg-white/[.045] p-4" style={{ transform: 'translateZ(20px)' }}>
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.2em] text-neon">
                  <Sigma className="h-3.5 w-3.5" /> Prédiction
                </span>
                <span className="rounded bg-gold/10 px-1.5 py-0.5 font-mono text-[10px] text-gold">{p.source}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ScoreBox label="Mi-temps" score={p.halfTimeScore} delay={delay} />
                <ScoreBox label="Score exact" score={p.fullTimeScore} delay={delay + 0.15} highlight sub={`${p.fullTimeScoreProbability.toFixed(1)} %`} />
              </div>

              <OutcomeBar p={p.probabilities} winner={p.winner} delay={delay + 0.1} />

              {!p.scoreMatchesWinner && (
                <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-snug text-slate-400">
                  <Info className="mt-px h-3.5 w-3.5 shrink-0 text-gold" />
                  <span>
                    Le score exact le plus probable ({p.fullTimeScore}) ne désigne pas le vainqueur le plus probable ({p.winner}) :
                    la tendance 1N2 additionne tous les scores possibles.
                  </span>
                </p>
              )}

              <div className="mt-4 flex items-center justify-between gap-3">
                <ConfidenceRing value={p.confidence} delay={delay + 0.2} />
                <div className="min-w-0 text-right">
                  <div className="text-[10px] uppercase tracking-[.18em] text-slate-400">{p.winner}</div>
                  <div className="truncate font-display text-base font-bold text-white">{winnerName}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-gold/20 bg-gold/5 p-4 text-sm text-gold">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Historique insuffisant (3 matchs terminés minimum par équipe) : {match.home.name}{' '}
                {match.homeHistory.goalsScored.length}, {match.away.name} {match.awayHistory.goalsScored.length}.
                Ajoutez des résultats dans l’administration.
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </motion.article>
  );
}

function TeamBlock({ m, side }: { m: MatchWithPrediction; side: 'home' | 'away' }) {
  const team = side === 'home' ? m.home : m.away;
  const h = side === 'home' ? m.homeHistory : m.awayHistory;
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <TeamCrest team={team} side={side} size={60} />
      <div className="w-full min-w-0">
        <div className="truncate font-display text-[15px] font-semibold text-white" title={team.name}>{team.name}</div>
        <div className="font-mono text-[10px] text-slate-500">
          {avg(h.goalsScored)} BM · {avg(h.goalsConceded)} BE
        </div>
      </div>
    </div>
  );
}

function ScoreBox({ label, score, delay, highlight, sub }: { label: string; score: string; delay: number; highlight?: boolean; sub?: string }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 text-center ${highlight ? 'bg-neon/10 ring-1 ring-neon/30' : 'bg-black/25'}`}>
      <div className="text-[10px] uppercase tracking-[.16em] text-slate-400">{label}</div>
      <ScoreCountUp
        score={score}
        delay={delay}
        className={`mt-0.5 block font-display text-[28px] font-bold tabular-nums leading-none ${highlight ? 'text-neon drop-shadow-[0_0_12px_rgba(57,255,136,.6)]' : 'text-white'}`}
      />
      {sub && <div className="mt-1 font-mono text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}

/** Barre 1 / N / 2 animée : probabilités cumulées de chaque issue. */
function OutcomeBar({ p, winner, delay }: { p: { home: number; draw: number; away: number }; winner: string; delay: number }) {
  const parts = [
    { key: '1', v: p.home, on: winner === 'Domicile', color: 'bg-neon' },
    { key: 'N', v: p.draw, on: winner === 'Match Nul', color: 'bg-slate-400' },
    { key: '2', v: p.away, on: winner === 'Extérieur', color: 'bg-gold' },
  ];
  return (
    <div className="mt-3">
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-white/5">
        {parts.map((x, i) => (
          <motion.div
            key={x.key}
            className={`${x.color} ${x.on ? 'opacity-100' : 'opacity-35'}`}
            initial={{ width: 0 }}
            whileInView={{ width: `${x.v}%` }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: delay + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px]">
        {parts.map((x) => (
          <span key={x.key} className={x.on ? 'font-bold text-white' : 'text-slate-500'}>
            {x.key} · {x.v.toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  );
}
