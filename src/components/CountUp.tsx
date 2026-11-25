import { animate, useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  duration?: number;
  decimals?: number;
  delay?: number;
  className?: string;
  suffix?: string;
}

/** Compteur animé qui démarre lorsque l'élément entre dans la vue. */
export function CountUp({ value, duration = 1.2, decimals = 0, delay = 0, className, suffix = '' }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value, duration, delay]);

  return (
    <span ref={ref} className={className}>
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/** Score « a - b » dont chaque nombre s'anime. */
export function ScoreCountUp({ score, className, delay = 0 }: { score: string; className?: string; delay?: number }) {
  const [a, b] = score.split(' - ').map(Number);
  return (
    <span className={className} aria-label={score}>
      <CountUp value={a} delay={delay} duration={0.9} />
      <span className="mx-1.5 opacity-40">-</span>
      <CountUp value={b} delay={delay + 0.1} duration={0.9} />
    </span>
  );
}
