-- =====================================================================
-- MLK FIFA Virtuel — schéma Supabase
-- À exécuter UNE fois dans Supabase : Dashboard → SQL Editor → New query
-- → coller ce fichier → Run. Le script est ré-exécutable sans erreur.
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

create table if not exists public.teams (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  logo_url   text,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id            bigint generated always as identity primary key,
  home_team_id  bigint not null references public.teams(id) on delete restrict,
  away_team_id  bigint not null references public.teams(id) on delete restrict,
  match_date    timestamptz not null default now(),
  status        text not null default 'upcoming'
                check (status in ('upcoming', 'live', 'finished')),
  home_score    smallint check (home_score >= 0),
  away_score    smallint check (away_score >= 0),
  home_ht_score smallint check (home_ht_score >= 0),
  away_ht_score smallint check (away_ht_score >= 0),
  created_at    timestamptz not null default now(),
  constraint matches_distinct_teams check (home_team_id <> away_team_id),
  -- Un match terminé doit avoir ses scores, et la mi-temps ne peut dépasser le score final.
  constraint matches_finished_scores check (
    status <> 'finished' or (
      home_score is not null and away_score is not null
      and home_ht_score is not null and away_ht_score is not null
      and home_ht_score <= home_score and away_ht_score <= away_score
    )
  )
);

-- getTeamHistory : « matchs où l'équipe est impliquée, triés par date décroissante »
create index if not exists matches_home_date_idx on public.matches (home_team_id, match_date desc);
create index if not exists matches_away_date_idx on public.matches (away_team_id, match_date desc);
create index if not exists matches_status_date_idx on public.matches (status, match_date);

create table if not exists public.predictions (
  id                 bigint generated always as identity primary key,
  match_id           bigint not null references public.matches(id) on delete cascade,
  predicted_winner   text not null check (predicted_winner in ('Domicile', 'Extérieur', 'Match Nul')),
  predicted_score_ft text not null,
  predicted_score_ht text not null,
  confidence         numeric(5, 2) not null check (confidence between 0 and 100),
  created_at         timestamptz not null default now()
);
create index if not exists predictions_match_idx on public.predictions (match_id, created_at desc);

-- ---------- Évolution v2 : cotes 1X2, base des prédictions, logos ------
-- Ajouts rejouables : si vous aviez déjà exécuté la v1 de ce script,
-- relancez simplement le fichier complet.

alter table public.matches add column if not exists odds_home numeric(6, 2);
alter table public.matches add column if not exists odds_draw numeric(6, 2);
alter table public.matches add column if not exists odds_away numeric(6, 2);
alter table public.matches drop constraint if exists matches_odds_check;
-- Les trois cotes ou aucune. (num_nonnulls évite le piège « NULL > 1 = NULL »,
-- qu'une contrainte CHECK laisserait passer.)
alter table public.matches add constraint matches_odds_check check (
  num_nonnulls(odds_home, odds_draw, odds_away) = 0
  or (num_nonnulls(odds_home, odds_draw, odds_away) = 3
      and odds_home > 1 and odds_draw > 1 and odds_away > 1)
);

-- 'odds' = prédiction tirée des cotes 1X2 ; 'history' = Double Poisson sur l'historique
alter table public.predictions add column if not exists basis text not null default 'history';
alter table public.predictions drop constraint if exists predictions_basis_check;
alter table public.predictions add constraint predictions_basis_check check (basis in ('odds', 'history'));

alter table public.teams drop constraint if exists teams_logo_url_check;
alter table public.teams add constraint teams_logo_url_check check (logo_url is null or logo_url ~* '^https?://');

-- ---------- Administrateurs ------------------------------------------
-- Seuls les comptes listés ici peuvent écrire. Voir README : après avoir créé
-- l'utilisateur dans Authentication → Users, exécutez :
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'VOTRE_EMAIL_ADMIN@exemple.com';

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- Row Level Security ---------------------------------------
-- Lecture publique (clé anon) ; écriture réservée aux administrateurs.

alter table public.teams       enable row level security;
alter table public.matches     enable row level security;
alter table public.predictions enable row level security;
alter table public.admins      enable row level security;

drop policy if exists "teams lisibles par tous" on public.teams;
create policy "teams lisibles par tous" on public.teams for select using (true);
drop policy if exists "teams modifiables par admin" on public.teams;
create policy "teams modifiables par admin" on public.teams for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "matches lisibles par tous" on public.matches;
create policy "matches lisibles par tous" on public.matches for select using (true);
drop policy if exists "matches modifiables par admin" on public.matches;
create policy "matches modifiables par admin" on public.matches for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "predictions lisibles par tous" on public.predictions;
create policy "predictions lisibles par tous" on public.predictions for select using (true);
drop policy if exists "predictions modifiables par admin" on public.predictions;
create policy "predictions modifiables par admin" on public.predictions for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "un admin voit sa ligne" on public.admins;
create policy "un admin voit sa ligne" on public.admins for select
  to authenticated using (user_id = auth.uid());

-- ---------- Temps réel ------------------------------------------------
-- Le site public se recalcule dès qu'un match est ajouté/supprimé.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
end $$;

-- ---------- Équipes de départ (FC 26 · Championnat d'Allemagne) -------
insert into public.teams (name) values
  ('Bayern Munich'), ('Borussia Dortmund'), ('Bayer Leverkusen'), ('RB Leipzig'),
  ('VfB Stuttgart'), ('Eintracht Francfort'), ('SC Fribourg'), ('VfL Wolfsburg'),
  ('Borussia Mönchengladbach'), ('Union Berlin'), ('Werder Brême'), ('TSG Hoffenheim'),
  ('FC Augsbourg'), ('Mayence 05'), ('FC Heidenheim'), ('FC St. Pauli'),
  ('Hambourg SV'), ('FC Cologne')
on conflict (name) do nothing;
