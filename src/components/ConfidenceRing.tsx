import { motion } from 'framer-motion';
import { CountUp } from './CountUp';

export function confidenceTone(c: number) {
  if (c >= 60) return { color: '#39ff88', label: 'Élevée' };
  if (c >= 45) return { color: '#f5c542', label: 'Moyenne' };
  return { color: '#ff4d6d', label: 'Faible' };
}

/** Badge de confiance : anneau circulaire animé + pourcentage. */
export function ConfidenceRing({ value, size = 64, delay = 0 }: { value: number; size?: number; delay?: number }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const { color, label } = confidenceTone(value);
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={stroke} />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            whileInView={{ strokeDashoffset: circ * (1 - Math.min(value, 100) / 100) }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, delay, ease: [0.16, 1, 0.3, 1] }}
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center font-mono text-[13px] font-bold text-white">
          <CountUp value={value} decimals={1} delay={delay} suffix="%" className="tabular-nums" />
        </div>
      </div>
      <div className="leading-tight">
        <div className="text-[10px] uppercase tracking-[.18em] text-slate-400">Confiance</div>
        <div className="font-display text-sm font-semibold" style={{ color }}>{label}</div>
      </div>
    </div>
  );
}
