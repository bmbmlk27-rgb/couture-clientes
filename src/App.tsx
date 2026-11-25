import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import {
  Activity, CalendarClock, ChevronDown, Flame, Gauge, Goal, LayoutGrid, ListTree, Swords, Target, Trophy, WifiOff,
} from 'lucide-react';
import { Header } from './components/Header';
import { Tabs, type TabDef } from './components/Tabs';
import { MatchCard } from './components/MatchCard';
import { Background } from './components/Background';
import { CountUp } from './components/CountUp';
import { useChampionships } from './hooks/useChampionships';
import { BASE_CONVERSION } from './lib/penaltyEngine';
import type { LeagueWithMatches, MatchKind, MatchWithPrediction } from './lib/types';

type TabId = 'all' | 'live' | 'upcoming' | 'hot';
type KindFilter = 'all' | MatchKind;
const HIGH_CONFIDENCE = 65;

const confidenceOf = (m: MatchWithPrediction) => m.penalty?.confidence ?? m.match?.confidence;

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export default function App() {
  const { leagues, apiError, latency, loading, updatedAt, reload } = useChampionships();
  const [tab, setTab] = useState<TabId>('all');
  const [kind, setKind] = useState<KindFilter>('all');

  const byTab: Record<TabId, (m: MatchWithPrediction) => boolean> = {
    all: () => true,
    live: (m) => m.status === 'live',
    upcoming: (m) => m.status === 'upcoming',
    hot: (m) => (confidenceOf(m) ?? 0) >= HIGH_CONFIDENCE,
  };

  const scopedLeagues = useMemo(() => leagues.filter((l) => kind === 'all' || l.kind === kind), [leagues, kind]);
  const allMatches = scopedLeagues.flatMap((l) => l.matches);
  const tabs: TabDef<TabId>[] = [
    { id: 'all', label: 'Tous', icon: LayoutGrid, count: allMatches.length },
    { id: 'live', label: 'En direct', icon: Activity, count: allMatches.filter(byTab.live).length },
    { id: 'upcoming', label: 'À venir', icon: CalendarClock, count: allMatches.filter(byTab.upcoming).length },
    { id: 'hot', label: 'Haute confiance', icon: Flame, count: allMatches.filter(byTab.hot).length },
  ];

  // Championnats avec matchs détaillés d'abord, puis ceux annoncés sans détail.
  const sections = scopedLeagues
    .map((l) => ({ ...l, visible: l.matches.filter(byTab[tab]) }))
    .sort((a, b) => Number(b.visible.length > 0) - Number(a.visible.length > 0));

  const predicted = allMatches.filter((m) => confidenceOf(m) !== undefined);
  const avgConf = predicted.length ? predicted.reduce((s, m) => s + confidenceOf(m)!, 0) / predicted.length : 0;
  const loadedLeagues = leagues.filter((l) => l.load === 'loaded').length;
  const apiDown = !!apiError;

  const kinds: { id: KindFilter; label: string; icon: typeof Goal }[] = [
    { id: 'all', label: 'Tous les championnats', icon: ListTree },
    { id: 'penalty', label: 'Penalty', icon: Goal },
    { id: 'match', label: 'Matchs', icon: Swords },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <Background />
      <Header apiConnected={!apiDown} apiError={apiError} latency={latency} loading={loading} updatedAt={updatedAt} onRefresh={reload} />

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8"
        >
          <p className="mb-2 font-mono text-xs uppercase tracking-[.3em] text-neon/80">// Football virtuel · Tous les championnats</p>
          <h2 className="max-w-3xl font-display text-3xl font-bold leading-tight text-white sm:text-4xl">
            Chaque match virtuel, <span className="text-gold">calculé</span> — pas deviné.
          </h2>
        </motion.section>

        <motion.section initial="hidden" animate="show" variants={gridVariants} className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={Trophy} label="Championnats annoncés" value={leagues.length} />
          <Kpi icon={ListTree} label="Championnats détaillés" value={loadedLeagues} />
          <Kpi icon={Target} label="Matchs prédits" value={predicted.length} />
          <Kpi icon={Gauge} label="Confiance moyenne" value={avgConf} decimals={1} suffix="%" />
        </motion.section>

        <div className="mb-6 flex flex-col gap-3">
          <Tabs tabs={tabs} active={tab} onChange={setTab} />
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {kinds.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setKind(id)}
                aria-pressed={kind === id}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold backdrop-blur-xl transition ${
                  kind === id ? 'border-gold/40 bg-gold/10 text-gold shadow-gold' : 'border-white/10 bg-night-800/50 text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        {!loading && apiDown && (
          <div className="mb-6 rounded-xl border border-danger/30 bg-danger/[.07] px-4 py-3 text-sm text-danger">
            API Melbet indisponible ({apiError}).{leagues.length > 0 && ' Dernière liste connue affichée.'} Nouvelle tentative toutes les 30 s.
          </div>
        )}

        <AnimatePresence mode="wait">
          {loading && leagues.length === 0 ? (
            <SkeletonGrid key="skeleton" />
          ) : leagues.length === 0 ? (
            <EmptyState key="no-data" apiDown={apiDown} />
          ) : (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
              {sections.map((l) => (
                <LeagueSection key={l.id} league={l} visible={l.visible} filtered={tab !== 'all'} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="mt-14 border-t border-white/5 pt-6 text-xs leading-relaxed text-slate-500">
          <p>
            <strong className="text-slate-400">Penalty</strong> : séance de tirs au but exacte (5 tirs chacun en alternance, arrêt dès qu’une
            équipe ne peut plus être rattrapée, puis mort subite). La réussite par tir est calée sur les cotes, marge retirée : en 1X2, « N »
            est l’égalité après 5 tirs ; en 2 issues, réussite moyenne de {Math.round(BASE_CONVERSION * 100)} %.
          </p>
          <p className="mt-1">
            <strong className="text-slate-400">Matchs</strong> : buts attendus de chaque équipe calés sur les cotes 1X2 (loi de Poisson) ;
            score exact et mi-temps = scores les plus probables, vainqueur et confiance = probabilités du marché.
          </p>
          <p className="mt-1">
            Les matchs virtuels sont tirés au sort par un générateur : ces modèles traduisent les cotes en probabilités lisibles, ils ne
            battent pas le bookmaker. Outil statistique, aucune garantie de résultat — pariez de façon responsable.
          </p>
        </footer>
      </main>
    </MotionConfig>
  );
}

function LeagueSection({ league, visible, filtered }: { league: LeagueWithMatches; visible: MatchWithPrediction[]; filtered: boolean }) {
  const [open, setOpen] = useState(true);
  const hasMatches = visible.length > 0;
  const Icon = league.kind === 'penalty' ? Goal : Swords;
  const status =
    league.load === 'loaded'
      ? filtered ? `${visible.length} / ${league.matches.length} match(s)` : `${league.matches.length} match(s)`
      : league.load === 'unavailable'
        ? `${league.gamesCount} annoncé(s) · détails indisponibles`
        : `${league.gamesCount} annoncé(s)`;

  return (
    <section className="rounded-2xl border border-white/[.06] bg-night-800/40 backdrop-blur-xl">
      <button
        onClick={() => hasMatches && setOpen((v) => !v)}
        aria-expanded={hasMatches ? open : undefined}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left ${hasMatches ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${hasMatches ? 'bg-neon/10 text-neon' : 'bg-white/5 text-slate-500'}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-display text-sm font-semibold sm:text-base ${hasMatches ? 'text-white' : 'text-slate-400'}`}>
            {league.name}
          </span>
          <span className="block truncate text-[11px] text-slate-500">
            {league.country ? `${league.country} · ` : ''}
            {league.kind === 'penalty' ? 'Penalty' : 'Match'}
          </span>
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] ${hasMatches ? 'bg-neon/10 text-neon' : 'bg-white/5 text-slate-500'}`}>
          {status}
        </span>
        {hasMatches && <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />}
      </button>
      {hasMatches && open && (
        <motion.div
          variants={gridVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-5 border-t border-white/[.05] p-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {visible.map((m, i) => (
            <MatchCard key={m.id} match={m} index={i} />
          ))}
        </motion.div>
      )}
    </section>
  );
}

function Kpi({
  icon: Icon, label, value, decimals = 0, suffix = '', text, tone = 'neon',
}: {
  icon: typeof Target; label: string; value?: number; decimals?: number; suffix?: string; text?: string; tone?: 'neon' | 'gold';
}) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
      className="rounded-2xl border border-white/[.06] bg-night-800/50 p-4 backdrop-blur-xl"
    >
      <div className="mb-2 flex items-start gap-2 text-[10px] uppercase leading-snug tracking-[.12em] text-slate-400 sm:text-[11px] sm:tracking-[.16em]">
        <Icon className={`mt-px h-3.5 w-3.5 shrink-0 ${tone === 'neon' ? 'text-neon' : 'text-gold'}`} />
        <span>{label}</span>
      </div>
      <div className={`truncate font-display text-2xl font-bold ${text ? (tone === 'neon' ? 'text-neon' : 'text-gold') : 'text-white'}`}>
        {text ?? <CountUp value={value ?? 0} decimals={decimals} suffix={suffix} className="tabular-nums" />}
      </div>
    </motion.div>
  );
}

function SkeletonGrid() {
  return (
    <motion.div exit={{ opacity: 0 }} className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-[420px] animate-pulse rounded-2xl border border-white/5 bg-night-800/40" />
      ))}
    </motion.div>
  );
}

function EmptyState({ apiDown }: { apiDown: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="grid place-items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-night-800/30 px-6 py-20 text-center backdrop-blur-xl"
    >
      <WifiOff className="h-9 w-9 text-slate-500" />
      <p className="font-display text-xl font-semibold text-white">Aucun championnat</p>
      <p className="max-w-md text-sm text-slate-400">
        {apiDown ? 'L’API Melbet ne répond pas pour le moment.' : 'Melbet n’annonce aucun championnat FIFA en ce moment.'} La liste se met à
        jour toute seule toutes les 30 s.
      </p>
    </motion.div>
  );
}
