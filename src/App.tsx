import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Activity, CalendarClock, Flame, LayoutGrid, Target, Gauge, Zap, SearchX, WifiOff, Trophy } from 'lucide-react';
import { Header } from './components/Header';
import { Tabs, type TabDef } from './components/Tabs';
import { MatchCard } from './components/MatchCard';
import { Background } from './components/Background';
import { CountUp } from './components/CountUp';
import { usePenaltyMatches } from './hooks/usePenaltyMatches';
import { BASE_CONVERSION } from './lib/penaltyEngine';
import type { MatchWithPrediction } from './lib/types';

type TabId = 'all' | 'live' | 'upcoming' | 'hot';
const HIGH_CONFIDENCE = 65;
const ALL_LEAGUES = 'Toutes';

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export default function App() {
  const { matches, apiError, latency, loading, updatedAt, reload } = usePenaltyMatches();
  const [tab, setTab] = useState<TabId>('all');
  const [league, setLeague] = useState(ALL_LEAGUES);

  const leagues = useMemo(() => [ALL_LEAGUES, ...new Set(matches.map((m) => m.league))], [matches]);
  const scoped = useMemo(
    () => (league === ALL_LEAGUES ? matches : matches.filter((m) => m.league === league)),
    [matches, league],
  );

  const byTab: Record<TabId, (m: MatchWithPrediction) => boolean> = {
    all: () => true,
    live: (m) => m.status === 'live',
    upcoming: (m) => m.status === 'upcoming',
    hot: (m) => (m.prediction?.confidence ?? 0) >= HIGH_CONFIDENCE,
  };
  const visible = scoped.filter(byTab[tab]);

  const tabs: TabDef<TabId>[] = [
    { id: 'all', label: 'Tous', icon: LayoutGrid, count: scoped.length },
    { id: 'live', label: 'En direct', icon: Activity, count: scoped.filter(byTab.live).length },
    { id: 'upcoming', label: 'À venir', icon: CalendarClock, count: scoped.filter(byTab.upcoming).length },
    { id: 'hot', label: 'Haute confiance', icon: Flame, count: scoped.filter(byTab.hot).length },
  ];

  const predicted = scoped.filter((m) => m.prediction);
  const mean = (f: (m: MatchWithPrediction) => number) =>
    predicted.length ? predicted.reduce((s, m) => s + f(m), 0) / predicted.length : 0;
  const avgConf = mean((m) => m.prediction!.confidence);
  const avgSudden = mean((m) => m.prediction!.suddenDeath);
  const apiDown = !!apiError;

  return (
    <MotionConfig reducedMotion="user">
      <Background />
      <Header apiConnected={!apiDown} apiError={apiError} latency={latency} loading={loading} updatedAt={updatedAt} onRefresh={reload} />

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8"
        >
          <p className="mb-2 font-mono text-xs uppercase tracking-[.3em] text-neon/80">// Football virtuel · Penalty</p>
          <h2 className="max-w-3xl font-display text-3xl font-bold leading-tight text-white sm:text-4xl">
            Chaque tir au but, <span className="text-gold">calculé</span> — pas deviné.
          </h2>
        </motion.section>

        {/* KPIs */}
        <motion.section initial="hidden" animate="show" variants={gridVariants} className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={Target} label="Matchs analysés" value={predicted.length} />
          <Kpi icon={Gauge} label="Confiance moyenne" value={avgConf} decimals={1} suffix="%" />
          <Kpi icon={Zap} label="Mort subite (moyenne)" value={avgSudden} decimals={0} suffix="%" />
          <Kpi icon={Trophy} label="Ligues Penalty" value={leagues.length - 1} />
        </motion.section>

        {/* Navigation & filtres */}
        <div className="mb-6 flex flex-col gap-3">
          <Tabs tabs={tabs} active={tab} onChange={setTab} />
          {leagues.length > 2 && (
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
              {leagues.map((l) => (
                <button
                  key={l}
                  onClick={() => setLeague(l)}
                  aria-pressed={league === l}
                  className={`shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold backdrop-blur-xl transition ${
                    league === l ? 'border-gold/40 bg-gold/10 text-gold shadow-gold' : 'border-white/10 bg-night-800/50 text-slate-400 hover:text-white'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>

        {!loading && apiDown && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-6 overflow-hidden rounded-xl border border-danger/30 bg-danger/[.07] px-4 py-3 text-sm text-danger"
          >
            API Melbet indisponible ({apiError}).{matches.length > 0 && ' Derniers matchs connus affichés.'} Nouvelle tentative toutes les 20 s.
          </motion.div>
        )}

        {/* Grille */}
        <AnimatePresence mode="wait">
          {loading && matches.length === 0 ? (
            <SkeletonGrid key="skeleton" />
          ) : matches.length === 0 ? (
            <EmptyState key="no-data" apiDown={apiDown} />
          ) : visible.length === 0 ? (
            <motion.div
              key={`empty-${tab}-${league}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid place-items-center gap-3 rounded-2xl border border-dashed border-white/10 py-20 text-center text-slate-400"
            >
              <SearchX className="h-8 w-8" />
              <p>Aucun match pour ce filtre.</p>
            </motion.div>
          ) : (
            <motion.div
              key={`${tab}-${league}`}
              variants={gridVariants}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3"
            >
              {visible.map((m, i) => (
                <MatchCard key={m.id} match={m} index={i} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="mt-14 border-t border-white/5 pt-6 text-xs leading-relaxed text-slate-500">
          <p>
            Modèle : séance de tirs au but exacte (5 tirs chacun en alternance, arrêt dès qu’une équipe ne peut plus être rattrapée,
            puis mort subite). La réussite par tir de chaque équipe est calée sur les cotes Melbet, marge du bookmaker retirée :
            en 1X2, « N » est l’égalité après 5 tirs ; en 2 issues, réussite moyenne fixée à {Math.round(BASE_CONVERSION * 100)} %.
            Le score exact affiché est le score final le plus probable.
          </p>
          <p className="mt-1">
            Les matchs virtuels sont tirés au sort par un générateur : ce modèle traduit les cotes en probabilités lisibles, il ne bat pas
            le bookmaker. Outil statistique, aucune garantie de résultat — pariez de façon responsable.
          </p>
        </footer>
      </main>
    </MotionConfig>
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
      <p className="font-display text-xl font-semibold text-white">Aucun match Penalty</p>
      <p className="max-w-md text-sm text-slate-400">
        {apiDown
          ? 'L’API Melbet ne répond pas pour le moment.'
          : 'Melbet n’a aucun match Penalty programmé en ce moment.'}{' '}
        La liste se met à jour toute seule toutes les 20 s.
      </p>
    </motion.div>
  );
}
