import { motion, useScroll, useTransform } from 'framer-motion';
import { RefreshCw, Goal } from 'lucide-react';

interface Props {
  apiConnected: boolean;
  apiError?: string;
  latency?: number;
  loading: boolean;
  updatedAt: number;
  onRefresh: () => void;
}

export function Header({ apiConnected, apiError, latency, loading, updatedAt, onRefresh }: Props) {
  const { scrollY } = useScroll();
  // Ombre et opacité dynamiques selon le défilement
  const shadow = useTransform(scrollY, [0, 120], ['0 0 0 rgba(0,0,0,0)', '0 18px 40px -12px rgba(0,0,0,.85)']);
  const bg = useTransform(scrollY, [0, 120], ['rgba(6,10,24,.35)', 'rgba(6,10,24,.78)']);
  const border = useTransform(scrollY, [0, 120], ['rgba(255,255,255,.04)', 'rgba(57,255,136,.18)']);

  return (
    <motion.header
      style={{ boxShadow: shadow, backgroundColor: bg, borderColor: border }}
      className="sticky top-0 z-40 border-b backdrop-blur-2xl backdrop-saturate-150"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3.5 sm:px-6">
        <motion.div
          initial={{ rotate: -90, scale: 0 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 14 }}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-neon to-gold text-abyss shadow-neon"
        >
          <Goal className="h-5 w-5" />
        </motion.div>
        <div className="min-w-0">
          <h1 className="animate-gradient-x truncate bg-gradient-to-r from-neon via-gold to-neon bg-[length:200%_auto] bg-clip-text font-display text-xl font-bold uppercase tracking-wide text-transparent sm:text-2xl">
            MLK FIFA Virtuel
          </h1>
          <p className="hidden text-[11px] uppercase tracking-[.22em] text-slate-500 sm:block">Penalty · Matchs · Prédictions</p>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <StatusPill
            ok={apiConnected}
            label={apiConnected ? 'API connectée' : 'API déconnectée'}
            short="API"
            title={apiConnected ? `API Melbet connectée${latency ? ` (${latency} ms)` : ''}` : `API déconnectée : ${apiError ?? 'inconnue'}`}
          />
          <span className="hidden font-mono text-[11px] text-slate-500 md:inline">
            {new Date(updatedAt).toLocaleTimeString('fr-FR')}
          </span>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onRefresh}
            disabled={loading}
            aria-label="Rafraîchir"
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:border-neon/40 hover:text-neon disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </motion.button>
        </div>
      </div>
    </motion.header>
  );
}

function StatusPill({ ok, label, short, title }: { ok: boolean; label: string; short: string; title: string }) {
  const tone = ok
      ? { box: 'border-neon/30 bg-neon/10 text-neon', dot: 'bg-neon' }
      : { box: 'border-danger/30 bg-danger/10 text-danger', dot: 'bg-danger' };
  return (
    <div className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium sm:px-3 ${tone.box}`} title={title}>
      <span className="relative flex h-2.5 w-2.5">
        <span className={`absolute inline-flex h-full w-full animate-ping-slow rounded-full ${tone.dot}`} />
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${tone.dot}`} />
      </span>
      <span className="hidden lg:inline">{label}</span>
      <span className="lg:hidden">{short}</span>
    </div>
  );
}
