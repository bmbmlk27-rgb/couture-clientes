import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Activity, CalendarClock, Flame, LayoutGrid, Filter, Check, DatabaseZap, Target, Home, Gauge, SearchX } from 'lucide-react';
import { Header } from './components/Header';
import { Tabs, type TabDef } from './components/Tabs';
import { MatchCard } from './components/MatchCard';
import { Background } from './components/Background';
import { CountUp } from './components/CountUp';
import { useMatches } from './hooks/useMatches';
import { GERMAN_LEAGUE } from './data/teams';
import type { MatchWithPrediction } from './lib/types';

type TabId = 'all' | 'live' | 'upcoming' | 'hot';
const HIGH_CONFIDENCE = 55;
const isGerman = (l: string) => /allemagne|germany|bundesliga|deutsch/i.test(l);

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export default function App() {
  const { matches, source, error, latency, loading, updatedAt, reload } = useMatches();
  const [tab, setTab] = useState<TabId>('all');
  const [germanOnly, setGermanOnly] = useState(true);

  const scoped = useMemo(
    () => (germanOnly ? matches.filter((m) => isGerman(m.league)) : matches),
    [matches, germanOnly],
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
  const avgConf = predicted.length ? predicted.reduce((s, m) => s + m.prediction!.confidence, 0) / predicted.length : 0;
  const homeShare = predicted.length ? (predicted.filter((m) => m.prediction!.winner === 'Domicile').length / predicted.length) * 100 : 0;

  return (
    <MotionConfig reducedMotion="user">
      <Background />
      <Header source={source} error={error} latency={latency} loading={loading} updatedAt={updatedAt} onRefresh={reload} />

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8"
        >
          <p className="mb-2 font-mono text-xs uppercase tracking-[.3em] text-neon/80">// Football virtuel · FC 26</p>
          <h2 className="max-w-3xl font-display text-3xl font-bold leading-tight text-white sm:text-4xl">
            Les pronostics du stade virtuel, <span className="text-gold">calculés</span> — pas devinés.
          </h2>
        </motion.section>

        {/* KPIs */}
        <motion.section
          initial="hidden"
          animate="show"
          variants={gridVariants}
          className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <Kpi icon={Target} label="Matchs analysés" value={predicted.length} />
          <Kpi icon={Gauge} label="Confiance moyenne" value={avgConf} decimals={1} suffix="%" />
          <Kpi icon={Home} label="Victoires domicile prédites" value={homeShare} decimals={0} suffix="%" />
          <Kpi icon={DatabaseZap} label="Source" text={source === 'api' ? 'API Melbet' : 'Démo'} tone={source === 'api' ? 'neon' : 'gold'} />
        </motion.section>

        {/* Navigation & filtres */}
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs tabs={tabs} active={tab} onChange={setTab} />
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setGermanOnly((v) => !v)}
            aria-pressed={germanOnly}
            className={`flex items-center gap-2 self-start rounded-xl border px-4 py-2.5 text-sm font-semibold backdrop-blur-xl transition ${
              germanOnly
                ? 'border-gold/40 bg-gold/10 text-gold shadow-gold'
                : 'border-white/10 bg-night-800/50 text-slate-400 hover:text-white'
            }`}
          >
            <Filter className="h-4 w-4" />
            {GERMAN_LEAGUE}
            <span className={`grid h-4 w-4 place-items-center rounded ${germanOnly ? 'bg-gold text-abyss' : 'border border-white/20'}`}>
              {germanOnly && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
          </motion.button>
        </div>

        {source === 'fallback' && !loading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-6 overflow-hidden rounded-xl border border-gold/20 bg-gold/[.06] px-4 py-3 text-sm text-gold/90"
          >
            API Melbet indisponible ({error ?? 'erreur inconnue'}). Affichage des <strong>données de test</strong> — nouvelle tentative automatique toutes les 60 s.
          </motion.div>
        )}

        {/* Grille */}
        <AnimatePresence mode="wait">
          {loading && matches.length === 0 ? (
            <SkeletonGrid key="skeleton" />
          ) : visible.length === 0 ? (
            <motion.div
              key={`empty-${tab}-${germanOnly}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid place-items-center gap-3 rounded-2xl border border-dashed border-white/10 py-20 text-center text-slate-400"
            >
              <SearchX className="h-8 w-8" />
              <p>Aucun match pour ce filtre.</p>
              {germanOnly && (
                <button onClick={() => setGermanOnly(false)} className="text-sm font-semibold text-neon hover:underline">
                  Afficher toutes les ligues
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div
              key={`${tab}-${germanOnly}-${updatedAt}`}
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
            Modèle : Double Poisson (λ domicile = BM<sub>dom</sub> × BE<sub>ext</sub> × 1,1 · λ extérieur = BM<sub>ext</sub> × BE<sub>dom</sub> × 0,9), scores 0–8, mi-temps à 45 % des λ.
          </p>
          <p className="mt-1">
            Historique des équipes simulé (l’API ne fournit pas les résultats passés). Écussons générés, sans logos officiels. Outil statistique : aucune garantie de résultat — pariez de façon responsable.
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
