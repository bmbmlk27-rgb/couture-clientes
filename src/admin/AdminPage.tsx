import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  ArrowLeft, CheckCircle2, Coins, Flag, ImageIcon, Loader2, LogOut, Lock, Minus, Plus, RefreshCw, Save, Shield, Trash2,
  TriangleAlert, Users, X,
} from 'lucide-react';
import { TeamCrest } from '../components/TeamCrest';
import { resolveTeam } from '../data/teams';
import { calculateHybridPrediction, type TeamHistory } from '../lib/predictionEngine';
import { AVG_LEAGUE_GOALS } from '../lib/config';
import { Background } from '../components/Background';
import { supabase } from '../lib/supabase';
import {
  EMPTY_HISTORY, currentUserIsAdmin, deleteMatch, fetchRecentMatches, fetchTeams, getTeamHistory, insertMatch, insertTeam,
  oddsOf, recomputeUpcomingPredictions, updateMatch, updateTeamLogo, type DbMatch, type DbTeam, type NewMatch,
} from '../lib/db';
import type { MatchStatus } from '../lib/types';
import {
  parseOddsInput, toDate, validateLogoUrl, validateMatchInput, type FormStatus, type OddsInput,
} from './validation';

/**
 * Panneau d'administration (/admin).
 *
 * Connexion : compte Supabase Auth (email + mot de passe) créé dans
 * Dashboard → Authentication → Users, PUIS ajouté à la table `admins`
 * (voir README). Pas de mot de passe codé en dur : il serait lisible par
 * n'importe qui dans le JavaScript publié. Les droits d'écriture sont
 * vérifiés côté base par les règles RLS.
 */
export default function AdminPage() {
  return (
    <MotionConfig reducedMotion="user">
      <Background />
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        <TopBar />
        {supabase ? <AuthGate /> : <SetupNeeded />}
      </div>
    </MotionConfig>
  );
}

/* ------------------------------------------------------------------ */

function TopBar({ right }: { right?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-center gap-3">
      <a href="/" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 transition hover:border-neon/40 hover:text-neon">
        <ArrowLeft className="h-4 w-4" /> Site
      </a>
      <div className="min-w-0">
        <h1 className="animate-gradient-x bg-gradient-to-r from-neon via-gold to-neon bg-[length:200%_auto] bg-clip-text font-display text-2xl font-bold uppercase tracking-wide text-transparent">
          Administration
        </h1>
        <p className="text-[11px] uppercase tracking-[.22em] text-slate-500">MLK FIFA Virtuel · Base de résultats</p>
      </div>
      <div className="ml-auto flex items-center gap-2">{right}</div>
    </header>
  );
}

const glass = 'rounded-2xl border border-white/[.07] bg-night-800/60 shadow-card backdrop-blur-xl';
const input =
  'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-neon/50 focus:ring-2 focus:ring-neon/20';
const label = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[.14em] text-slate-400';

function SetupNeeded() {
  return (
    <div className={`${glass} max-w-2xl p-6`}>
      <div className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-gold">
        <TriangleAlert className="h-5 w-5" /> Supabase n’est pas configuré
      </div>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
        <li>Créez un projet sur supabase.com et exécutez <code className="font-mono text-neon">supabase/schema.sql</code>.</li>
        <li>Copiez <code className="font-mono text-neon">.env.example</code> en <code className="font-mono text-neon">.env.local</code>.</li>
        <li>Renseignez <code className="font-mono">VITE_SUPABASE_URL</code> et <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>, puis relancez <code className="font-mono">npm run dev</code>.</li>
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AuthGate() {
  const sb = supabase!;
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  useEffect(() => {
    if (!session) { setIsAdmin(null); return; }
    currentUserIsAdmin().then(setIsAdmin).catch((e) => { setError(e.message); setIsAdmin(false); });
  }, [session]);

  if (!ready) return <Spinner />;
  if (!session) return <LoginForm />;
  if (isAdmin === null) return <Spinner />;

  const logout = (
    <button onClick={() => sb.auth.signOut()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 transition hover:border-danger/40 hover:text-danger">
      <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Déconnexion</span>
    </button>
  );

  if (!isAdmin) {
    return (
      <div className={`${glass} max-w-2xl p-6`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-display text-lg font-semibold text-danger"><Lock className="h-5 w-5" /> Accès refusé</span>
          {logout}
        </div>
        <p className="text-sm text-slate-300">
          Le compte <strong>{session.user.email}</strong> n’est pas administrateur. Dans Supabase → SQL Editor, exécutez :
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs text-neon">
{`insert into public.admins (user_id)
select id from auth.users where email = '${session.user.email}';`}
        </pre>
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return <Dashboard email={session.user.email ?? ''} logout={logout} />;
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message === 'Invalid login credentials' ? 'Email ou mot de passe incorrect.' : error.message);
    setBusy(false);
  };

  return (
    <motion.form
      onSubmit={submit}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${glass} mx-auto mt-10 max-w-sm p-6`}
    >
      <div className="mb-5 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-neon to-gold text-abyss shadow-neon">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <div className="font-display text-lg font-semibold text-white">Connexion admin</div>
          <div className="text-xs text-slate-500">Compte Supabase Auth</div>
        </div>
      </div>
      <label className={label} htmlFor="email">Email</label>
      <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${input} mb-4`} />
      <label className={label} htmlFor="password">Mot de passe</label>
      <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <button disabled={busy} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-neon to-neon-soft px-4 py-2.5 font-semibold text-abyss shadow-neon transition disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Se connecter
      </button>
    </motion.form>
  );
}

/* ------------------------------------------------------------------ */

type Toast = { kind: 'ok' | 'error'; text: string } | null;

function Dashboard({ email, logout }: { email: string; logout: ReactNode }) {
  const [teams, setTeams] = useState<DbTeam[]>([]);
  const [recent, setRecent] = useState<DbMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [editing, setEditing] = useState<DbMatch | null>(null);

  const notify = useCallback((t: Toast) => {
    setToast(t);
    setTimeout(() => setToast(null), 4500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([fetchTeams(), fetchRecentMatches()]);
      setTeams(t);
      setRecent(r);
    } catch (e) {
      notify({ kind: 'error', text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { refresh(); }, [refresh]);

  /** Après chaque modification : recalcul des prédictions des prochains matchs. */
  const afterChange = useCallback(async (what: string) => {
    setRecomputing(true);
    try {
      const { computed, skipped } = await recomputeUpcomingPredictions();
      notify({
        kind: 'ok',
        text: `${what} · ${computed} prédiction(s) recalculée(s)${skipped ? `, ${skipped} en attente d’historique ou de cotes` : ''}. Le site public est à jour.`,
      });
    } catch (e) {
      notify({ kind: 'error', text: `${what}, mais recalcul impossible : ${(e as Error).message}` });
    }
    setRecomputing(false);
    await refresh();
  }, [notify, refresh]);

  const teamName = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);

  return (
    <>
      <div className="-mt-4 mb-6 flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500">
        <span className="truncate">Connecté : {email}</span>
        <button
          onClick={() => afterChange('Recalcul manuel')}
          disabled={recomputing}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 transition hover:border-neon/40 hover:text-neon disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${recomputing ? 'animate-spin' : ''}`} /> Recalculer
        </button>
        {logout}
      </div>

      {loading ? <Spinner /> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="space-y-6">
            <MatchForm
              teams={teams}
              editing={editing}
              onCancelEdit={() => setEditing(null)}
              onSaved={(what) => afterChange(what)}
              onError={(t) => notify({ kind: 'error', text: t })}
            />
            <TeamForm teams={teams} onSaved={async (msg) => { notify({ kind: 'ok', text: msg }); await refresh(); }} onError={(t) => notify({ kind: 'error', text: t })} />
          </div>
          <RecentList
            matches={recent}
            teamName={teamName}
            onEnterResult={(m) => {
              setEditing(m);
              document.getElementById('match-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            onDelete={async (id) => {
              try {
                if (editing?.id === id) setEditing(null);
                await deleteMatch(id);
                await afterChange('Match supprimé');
              } catch (e) {
                notify({ kind: 'error', text: (e as Error).message });
              }
            }}
          />
        </div>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30 }}
            className={`fixed inset-x-4 bottom-5 z-50 mx-auto flex max-w-md items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-card backdrop-blur-xl sm:inset-x-auto sm:right-6 ${
              toast.kind === 'ok' ? 'border-neon/30 bg-night-800/90 text-neon' : 'border-danger/40 bg-night-800/90 text-danger'
            }`}
          >
            {toast.kind === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{toast.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ------------------------------------------------------------------ */

const STATUS_OPTIONS: { id: FormStatus; label: string }[] = [
  { id: 'finished', label: 'Terminé' },
  { id: 'upcoming', label: 'À venir' },
];

const pad = (n: number) => String(n).padStart(2, '0');
/** Date et heure locales au format des inputs date / time. */
function localParts(d = new Date()) {
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
const EMPTY_ODDS: OddsInput = { home: '', draw: '', away: '' };
const oddsToInput = (m: DbMatch): OddsInput => {
  const o = oddsOf(m);
  return o ? { home: String(o.home), draw: String(o.draw), away: String(o.away) } : EMPTY_ODDS;
};

function MatchForm({ teams, editing, onCancelEdit, onSaved, onError }: {
  teams: DbTeam[];
  /** Match « À venir » dont on saisit le résultat (mise à jour au lieu d'un ajout). */
  editing: DbMatch | null;
  onCancelEdit: () => void;
  onSaved: (what: string) => Promise<void>;
  onError: (t: string) => void;
}) {
  const [home, setHome] = useState<number | ''>('');
  const [away, setAway] = useState<number | ''>('');
  const [status, setStatus] = useState<FormStatus>('finished');
  const [date, setDate] = useState(() => localParts().date);
  const [time, setTime] = useState(() => localParts().time);
  const [ft, setFt] = useState<[number, number]>([0, 0]);
  const [ht, setHt] = useState<[number, number]>([0, 0]);
  const [odds, setOdds] = useState<OddsInput>(EMPTY_ODDS);
  const [busy, setBusy] = useState(false);

  // Passage en mode « Saisir le résultat » : pré-remplissage depuis la ligne choisie.
  useEffect(() => {
    if (!editing) return;
    const p = localParts(new Date(editing.match_date));
    setHome(editing.home_team_id);
    setAway(editing.away_team_id);
    setDate(p.date);
    setTime(p.time);
    setStatus('finished');
    setFt([0, 0]);
    setHt([0, 0]);
    setOdds(oddsToInput(editing));
  }, [editing]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validateMatchInput({ home, away, status, date, time, ft, ht, odds });
    if (err) return onError(err);
    const parsed = parseOddsInput(odds);
    const o = 'odds' in parsed ? parsed.odds : null;
    const finished = status === 'finished';
    const row: NewMatch = {
      home_team_id: Number(home),
      away_team_id: Number(away),
      match_date: toDate(date, time)!.toISOString(),
      status,
      home_score: finished ? ft[0] : null,
      away_score: finished ? ft[1] : null,
      home_ht_score: finished ? ht[0] : null,
      away_ht_score: finished ? ht[1] : null,
      odds_home: o?.home ?? null,
      odds_draw: o?.draw ?? null,
      odds_away: o?.away ?? null,
    };
    setBusy(true);
    try {
      if (editing) {
        await updateMatch(editing.id, row);
        onCancelEdit();
      } else {
        await insertMatch(row);
      }
      // On garde les équipes pour enchaîner la saisie d'une journée ; on remet scores et cotes à zéro.
      setFt([0, 0]);
      setHt([0, 0]);
      setOdds(EMPTY_ODDS);
      await onSaved(editing ? 'Résultat enregistré' : finished ? 'Match enregistré' : 'Match à venir publié');
    } catch (e) {
      onError((e as Error).message);
    }
    setBusy(false);
  };

  if (teams.length < 2) {
    return (
      <div className={`${glass} p-5 text-sm text-slate-300`}>
        <p className="font-display text-lg font-semibold text-white">Aucune donnée</p>
        Ajoutez au moins deux équipes (ou exécutez la partie « Équipes de départ » de <code className="font-mono">schema.sql</code>).
      </div>
    );
  }

  const teamOptions = (exclude: number | '') =>
    teams.map((t) => (
      <option key={t.id} value={t.id} disabled={t.id === exclude}>{t.name}</option>
    ));

  return (
    <motion.form
      id="match-form"
      onSubmit={submit}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${glass} p-5 ${editing ? 'ring-1 ring-gold/50' : ''}`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-white">{editing ? 'Saisir le résultat' : 'Saisir un match'}</h2>
        {editing && (
          <button type="button" onClick={onCancelEdit} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white">
            <X className="h-3.5 w-3.5" /> Annuler
          </button>
        )}
      </div>

      <div>
        <span className={label}>Statut</span>
        <div role="radiogroup" aria-label="Statut" className="flex gap-1 rounded-lg border border-white/10 bg-black/30 p-1">
          {STATUS_OPTIONS.map((s) => (
            <button
              type="button"
              role="radio"
              aria-checked={status === s.id}
              key={s.id}
              disabled={!!editing && s.id === 'upcoming'}
              onClick={() => setStatus(s.id)}
              className={`relative flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${status === s.id ? 'text-abyss' : 'text-slate-400 hover:text-white'}`}
            >
              {status === s.id && <motion.span layoutId="status-pill" className="absolute inset-0 rounded-md bg-neon" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <span className="relative">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="home">Domicile *</label>
          <select id="home" value={home} onChange={(e) => setHome(e.target.value ? Number(e.target.value) : '')} className={input} required disabled={!!editing}>
            <option value="">— Équipe —</option>
            {teamOptions(away)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="away">Extérieur *</label>
          <select id="away" value={away} onChange={(e) => setAway(e.target.value ? Number(e.target.value) : '')} className={input} required disabled={!!editing}>
            <option value="">— Équipe —</option>
            {teamOptions(home)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="date">Date *</label>
          <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${input} [color-scheme:dark]`} required />
        </div>
        <div>
          <label className={label} htmlFor="time">Heure *</label>
          <input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${input} [color-scheme:dark]`} required />
        </div>
      </div>

      <AnimatePresence initial={false} mode="popLayout">
        {status === 'finished' ? (
          <motion.div key="scores" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-4 grid gap-3">
              <ScorePair title="Score final" value={ft} onChange={setFt} highlight />
              <ScorePair title="Mi-temps" value={ht} onChange={setHt} max={ft} />
            </div>
          </motion.div>
        ) : (
          <motion.div key="odds" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <OddsFields value={odds} onChange={setOdds} />
            <PredictionPreview home={home} away={away} odds={odds} />
          </motion.div>
        )}
      </AnimatePresence>

      <button disabled={busy} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-neon to-neon-soft px-4 py-2.5 font-semibold text-abyss shadow-neon transition hover:brightness-110 disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {editing ? 'Enregistrer le résultat' : status === 'upcoming' ? 'Publier le match à venir' : 'Enregistrer et recalculer'}
      </button>
      <p className="mt-2 text-center text-[11px] text-slate-500">* obligatoire</p>
    </motion.form>
  );
}

function OddsFields({ value, onChange }: { value: OddsInput; onChange: (v: OddsInput) => void }) {
  const fields: { key: keyof OddsInput; label: string }[] = [
    { key: 'home', label: '1 (Domicile)' },
    { key: 'draw', label: 'X (Nul)' },
    { key: 'away', label: '2 (Extérieur)' },
  ];
  return (
    <fieldset className="mt-4 rounded-xl border border-gold/20 bg-gold/[.04] p-3">
      <legend className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-[.14em] text-gold">
        <Coins className="h-3.5 w-3.5" /> Cotes 1X2 <span className="normal-case tracking-normal text-slate-500">(optionnel)</span>
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={`odds-${f.key}`} className="mb-1 block text-[10px] text-slate-400">{f.label}</label>
            <input
              id={`odds-${f.key}`}
              inputMode="decimal"
              placeholder="ex. 1.85"
              value={value[f.key]}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
              className={`${input} text-center font-mono`}
            />
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-slate-500">
        Avec les cotes, la prédiction se base sur le marché. Sans cotes, sur l’historique des deux équipes.
      </p>
    </fieldset>
  );
}

/** Aperçu de la prédiction qui s'affichera sur le site public. */
function PredictionPreview({ home, away, odds }: { home: number | ''; away: number | ''; odds: OddsInput }) {
  const [histories, setHistories] = useState<[TeamHistory, TeamHistory] | null>(null);
  useEffect(() => {
    setHistories(null);
    if (!home || !away || home === away) return;
    let alive = true;
    Promise.all([getTeamHistory(home), getTeamHistory(away)])
      .then((h) => alive && setHistories(h))
      .catch(() => alive && setHistories([EMPTY_HISTORY, EMPTY_HISTORY]));
    return () => { alive = false; };
  }, [home, away]);

  if (!home || !away || home === away) return null;
  if (!histories) return <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Calcul de l’aperçu…</div>;
  const parsed = parseOddsInput(odds);
  const p = calculateHybridPrediction('odds' in parsed ? parsed.odds : null, histories[0], histories[1], AVG_LEAGUE_GOALS);
  if (!p) {
    return (
      <p className="mt-3 rounded-lg bg-black/25 px-3 py-2 text-xs text-gold">
        Aperçu : pas encore de prédiction (historique : {histories[0].goalsScored.length} et {histories[1].goalsScored.length} matchs terminés, 3 minimum).
        Ajoutez des cotes pour obtenir une prédiction immédiate.
      </p>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-black/25 px-3 py-2 text-xs text-slate-300">
      <span className="font-semibold uppercase tracking-wider text-slate-500">Aperçu</span>
      <span className="font-semibold text-white">{p.winner} · {p.confidence.toFixed(1)} %</span>
      <span>Score exact <strong className="font-display text-neon">{p.fullTimeScore}</strong></span>
      <span>MT {p.halfTimeScore}</span>
      <span className={p.basis === 'odds' ? 'text-gold' : 'text-sky-300'}>{p.basis === 'odds' ? 'Basé sur les cotes' : 'Basé sur l’historique'}</span>
    </div>
  );
}

function ScorePair({ title, value, onChange, highlight, max }: {
  title: string; value: [number, number]; onChange: (v: [number, number]) => void; highlight?: boolean; max?: [number, number];
}) {
  const set = (i: 0 | 1, n: number) => {
    const next: [number, number] = [...value];
    next[i] = Math.max(0, Math.min(20, n));
    onChange(next);
  };
  return (
    <div className={`rounded-xl p-3 ${highlight ? 'bg-neon/10 ring-1 ring-neon/30' : 'bg-black/25'}`}>
      <div className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">{title}</div>
      <div className="flex items-center justify-center gap-2">
        <Stepper value={value[0]} onChange={(n) => set(0, n)} warn={max ? value[0] > max[0] : false} label={`${title} domicile`} />
        <span className="text-slate-500">–</span>
        <Stepper value={value[1]} onChange={(n) => set(1, n)} warn={max ? value[1] > max[1] : false} label={`${title} extérieur`} />
      </div>
    </div>
  );
}

function Stepper({ value, onChange, warn, label: aria }: { value: number; onChange: (n: number) => void; warn?: boolean; label: string }) {
  const btn = 'grid h-7 w-7 place-items-center rounded-md bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white';
  return (
    <div className="flex items-center gap-1">
      <button type="button" className={btn} onClick={() => onChange(value - 1)} aria-label={`${aria} moins un`}><Minus className="h-3.5 w-3.5" /></button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={20}
        aria-label={aria}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className={`w-10 bg-transparent text-center font-display text-2xl font-bold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none ${warn ? 'text-danger' : 'text-white'}`}
      />
      <button type="button" className={btn} onClick={() => onChange(value + 1)} aria-label={`${aria} plus un`}><Plus className="h-3.5 w-3.5" /></button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const NEW_TEAM = 'new';

/** Ajout d'une équipe ou association d'un logo à une équipe existante. */
function TeamForm({ teams, onSaved, onError }: { teams: DbTeam[]; onSaved: (msg: string) => Promise<void>; onError: (t: string) => void }) {
  const [selected, setSelected] = useState<string>(NEW_TEAM);
  const [name, setName] = useState('');
  const [logo, setLogo] = useState('');
  const [busy, setBusy] = useState(false);
  const existing = selected === NEW_TEAM ? undefined : teams.find((t) => String(t.id) === selected);

  const pick = (value: string) => {
    setSelected(value);
    const t = teams.find((x) => String(x.id) === value);
    setName(t?.name ?? '');
    setLogo(t?.logo_url ?? '');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validateLogoUrl(logo);
    if (err) return onError(err);
    if (!existing && !name.trim()) return onError('Indiquez le nom de l’équipe.');
    setBusy(true);
    try {
      if (existing) {
        const t = await updateTeamLogo(existing.id, logo || null);
        await onSaved(t.logo_url ? `Logo de « ${t.name} » enregistré.` : `Logo de « ${t.name} » retiré.`);
      } else {
        const t = await insertTeam(name, logo);
        setName('');
        setLogo('');
        await onSaved(`Équipe « ${t.name} » ajoutée.`);
      }
    } catch (e) {
      onError((e as Error).message);
    }
    setBusy(false);
  };

  const previewName = existing?.name ?? (name.trim() || 'Nouvelle équipe');
  const preview = resolveTeam(previewName, { logoUrl: validateLogoUrl(logo) ? null : logo.trim() || null });

  return (
    <form onSubmit={submit} className={`${glass} p-5`}>
      <h2 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-white">
        <Users className="h-4 w-4 text-gold" /> Équipes & logos
      </h2>
      <div className="flex gap-4">
        <div className="group shrink-0 pt-1" aria-label="Aperçu de l’écusson">
          <TeamCrest team={preview} side="home" size={56} />
        </div>
        <div className="grid min-w-0 flex-1 gap-3">
          <div>
            <label className={label} htmlFor="team-select">Équipe</label>
            <select id="team-select" value={selected} onChange={(e) => pick(e.target.value)} className={input}>
              <option value={NEW_TEAM}>+ Nouvelle équipe</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.logo_url ? ' · logo ✓' : ''}</option>
              ))}
            </select>
          </div>
          {!existing && (
            <div>
              <label className={label} htmlFor="team-name">Nom</label>
              <input id="team-name" placeholder="ex. Hertha Berlin" value={name} onChange={(e) => setName(e.target.value)} className={input} />
            </div>
          )}
          <div>
            <label className={label} htmlFor="team-logo">URL du logo <span className="normal-case tracking-normal text-slate-500">(optionnel)</span></label>
            <input id="team-logo" placeholder="https://…/logo.png" inputMode="url" value={logo} onChange={(e) => setLogo(e.target.value)} className={input} />
            <p className="mt-1 text-[11px] text-slate-500">Vide = écusson SVG généré. Si l’image ne charge pas, l’écusson SVG est affiché.</p>
          </div>
          <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm font-semibold text-gold transition hover:bg-gold/20 disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : existing ? <ImageIcon className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {existing ? 'Enregistrer le logo' : 'Ajouter l’équipe'}
          </button>
        </div>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */

const STATUS_CHIP: Record<MatchStatus, string> = {
  finished: 'bg-white/5 text-slate-400',
  upcoming: 'bg-neon/10 text-neon',
  live: 'bg-danger/15 text-danger',
};
const STATUS_LABEL: Record<MatchStatus, string> = { finished: 'Terminé', upcoming: 'À venir', live: 'En direct' };

function RecentList({ matches, teamName, onDelete, onEnterResult }: {
  matches: DbMatch[];
  teamName: Map<number, string>;
  onDelete: (id: number) => Promise<void>;
  onEnterResult: (m: DbMatch) => void;
}) {
  const [confirm, setConfirm] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    if (confirm === null) return;
    const t = setTimeout(() => setConfirm(null), 3500);
    return () => clearTimeout(t);
  }, [confirm]);

  return (
    <section className={`${glass} p-5`}>
      <h2 className="mb-4 font-display text-lg font-semibold text-white">Derniers matchs saisis</h2>
      {matches.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 py-12 text-center text-sm text-slate-400">Aucune donnée. Le premier match saisi apparaîtra ici.</p>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {matches.map((m) => {
              const o = oddsOf(m);
              return (
                <motion.li
                  key={m.id}
                  layout
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 40, height: 0, marginTop: 0 }}
                  className="flex items-center gap-3 rounded-xl border border-white/[.05] bg-white/[.03] px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 text-sm text-white">
                      <span className="truncate">{teamName.get(m.home_team_id) ?? `#${m.home_team_id}`}</span>
                      <span className="font-display font-bold tabular-nums text-neon">
                        {m.status === 'finished' ? `${m.home_score} - ${m.away_score}` : 'vs'}
                      </span>
                      <span className="truncate">{teamName.get(m.away_team_id) ?? `#${m.away_team_id}`}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-500">
                      <span>{new Date(m.match_date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      {m.status === 'finished' && <span>MT {m.home_ht_score} - {m.away_ht_score}</span>}
                      {o && <span className="text-gold/80">1 {o.home.toFixed(2)} · X {o.draw.toFixed(2)} · 2 {o.away.toFixed(2)}</span>}
                      <span className={`rounded px-1.5 py-px font-sans text-[10px] font-semibold uppercase ${STATUS_CHIP[m.status]}`}>{STATUS_LABEL[m.status]}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                    {m.status !== 'finished' && (
                      <button
                        onClick={() => onEnterResult(m)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-neon/30 px-2.5 py-1.5 text-xs font-semibold text-neon transition hover:bg-neon/10"
                      >
                        <Flag className="h-3.5 w-3.5" /> Résultat
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        if (confirm !== m.id) return setConfirm(m.id);
                        setDeleting(m.id);
                        await onDelete(m.id);
                        setDeleting(null);
                        setConfirm(null);
                      }}
                      disabled={deleting === m.id}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                        confirm === m.id ? 'border-danger bg-danger text-white' : 'border-white/10 text-slate-400 hover:border-danger/50 hover:text-danger'
                      }`}
                    >
                      {deleting === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      {confirm === m.id ? 'Confirmer' : 'Supprimer'}
                    </button>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function Spinner() {
  return (
    <div className="grid place-items-center py-24 text-slate-500">
      <Loader2 className="h-7 w-7 animate-spin" />
    </div>
  );
}
