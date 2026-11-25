import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Activity, CalendarClock, Flame, LayoutGrid, Filter, Check, DatabaseZap, Target, Home, Gauge, SearchX, Database, Shield } from 'lucide-react';
import { Header } from './components/Header';
import { Tabs, type TabDef } from './components/Tabs';
import { MatchCard } from './components/MatchCard';
import { Background } from './components/Background';
import { CountUp } from './components/CountUp';
import { useMatches } from './hooks/useMatches';
import { GERMAN_LEAGUE } from './data/teams';
import type { DataSource, DbState, MatchWithPrediction } from './lib/types';
import { AVG_LEAGUE_GOALS } from './lib/config';

type TabId = 'all' | 'live' | 'upcoming' | 'hot';
const HIGH_CONFIDENCE = 55;
const isGerman = (l: string) => /allemagne|germany|bundesliga|deutsch/i.test(l);

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export default function App() {
  const { matches, source, apiError, dbState, dbError, latency, loading, updatedAt, reload } = useMatches();
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
      <Header
        apiConnected={source === 'api'}
        apiError={apiError}
        dbState={dbState}
        dbError={dbError}
        latency={latency}
        loading={loading}
        updatedAt={updatedAt}
        onRefresh={reload}
      />

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
          <Kpi icon={DatabaseZap} label="Source des matchs" text={SOURCE_LABEL[source]} tone={source === 'fallback' ? 'gold' : 'neon'} />
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

        {!loading && <StatusBanner source={source} apiError={apiError} dbState={dbState} dbError={dbError} />}

        {/* Grille */}
        <AnimatePresence mode="wait">
          {loading && matches.length === 0 ? (
            <SkeletonGrid key="skeleton" />
          ) : matches.length === 0 ? (
            <EmptyState key="no-data" dbState={dbState} />
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
            Modèle : Double Poisson normalisé (λ dom = BM<sub>dom</sub>/M × BE<sub>ext</sub>/M × M × 1,1 · λ ext = BM<sub>ext</sub>/M × BE<sub>dom</sub>/M × M × 0,9,
            M = {AVG_LEAGUE_GOALS}), sur les 10 derniers matchs terminés. Le score exact affiché est la case la plus probable de la matrice ;
            la tendance 1N2 est la somme des probabilités.
          </p>
          <p className="mt-1">
            {dbState === 'disabled'
              ? 'Mode démo : Supabase non configuré, historiques des équipes simulés. '
              : 'Historiques issus de la base Supabase. '}
            Outil statistique : aucune garantie de résultat — pariez de façon responsable.
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

const SOURCE_LABEL: Record<DataSource, string> = { api: 'API Melbet', database: 'Supabase', fallback: 'Démo' };

function StatusBanner({ source, apiError, dbState, dbError }: { source: DataSource; apiError?: string; dbState: DbState; dbError?: string }) {
  let msg: React.ReactNode = null;
  if (dbState === 'error') {
    msg = <>Base Supabase injoignable ({dbError}). Les prédictions sont suspendues ; nouvelle tentative toutes les 60 s.</>;
  } else if (dbState === 'disabled') {
    msg = (
      <>
        <strong>Mode démo</strong> : Supabase n’est pas configuré (voir <code className="font-mono">.env.example</code>), les historiques sont simulés.
        {source === 'fallback' && <> API Melbet indisponible ({apiError ?? 'erreur inconnue'}) : matchs de test affichés.</>}
      </>
    );
  } else if (source === 'database') {
    msg = <>API Melbet indisponible ({apiError ?? 'erreur inconnue'}) : affichage des matchs à venir saisis dans la base.</>;
  }
  if (!msg) return null;
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className={`mb-6 overflow-hidden rounded-xl border px-4 py-3 text-sm ${
        dbState === 'error' ? 'border-danger/30 bg-danger/[.07] text-danger' : 'border-gold/20 bg-gold/[.06] text-gold/90'
      }`}
    >
      {msg}
    </motion.div>
  );
}

function EmptyState({ dbState }: { dbState: DbState }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="grid place-items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-night-800/30 px-6 py-20 text-center backdrop-blur-xl"
    >
      <Database className="h-9 w-9 text-slate-500" />
      <p className="font-display text-xl font-semibold text-white">Aucune donnée</p>
      <p className="max-w-md text-sm text-slate-400">
        Aucun match à venir n’a été trouvé (API Melbet indisponible et aucun match « à venir » dans la base).
        {dbState === 'connected' && ' Saisissez des résultats et les prochains matchs dans l’administration.'}
      </p>
      {dbState === 'connected' && (
        <a
          href="/admin"
          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-neon to-neon-soft px-4 py-2 text-sm font-semibold text-abyss shadow-neon"
        >
          <Shield className="h-4 w-4" /> Ouvrir l’administration
        </a>
      )}
    </motion.div>
  );
}
