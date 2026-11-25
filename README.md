# MLK FIFA Virtuel

Prédictions de football virtuel (FC 26 · Championnat d'Allemagne) par modèle **Double Poisson**.
React + TypeScript (Vite), Tailwind CSS, Framer Motion, Lucide React, Supabase.

```
src/lib/predictionEngine.ts   moteur Double Poisson
src/lib/db.ts                 requêtes Supabase (historique, matchs, prédictions)
src/lib/supabase.ts           client Supabase (lit les variables d'environnement)
src/admin/                    panneau /admin
server/melbetProxy.ts         relais API Melbet : liste des matchs + cotes 1X2 (partagé Vercel / Netlify / dev)
src/lib/odds.ts               extraction du marché 1X2, probabilités implicites
functions/api/…               Cloudflare Pages Functions (déploiement recommandé)
api/melbet.ts                 fonction serverless Vercel
netlify/functions/melbet.ts   fonction serverless Netlify
supabase/schema.sql           tables, sécurité (RLS), équipes de départ
```

## Démarrage local

```bash
npm install
cp .env.example .env.local   # puis renseigner les clés Supabase (voir ci-dessous)
npm run dev                  # http://localhost:5173  ·  admin : http://localhost:5173/admin
npm test
```

Sans `.env.local`, l'app tourne en **mode démo** : historiques simulés, bandeau « Mode démo », aucune écriture possible.

## Le modèle (hybride)

Chaque carte indique la source de sa prédiction : **« Basé sur les cotes »** ou **« Basé sur l'historique »**.

### 1. Avec cotes 1X2 (prioritaire)

Les cotes viennent de l'API Melbet (`/api/melbet-odds`) ou d'une saisie manuelle dans `/admin`.

1. Probabilités implicites : `pᵢ = (1/coteᵢ) / Σ(1/cote)`. La marge du bookmaker (`Σ(1/cote) − 1`) est retirée.
2. On cherche les buts attendus (λ domicile, λ extérieur) dont les probabilités Poisson 1/N/2 collent le mieux à celles du marché (moindres carrés, recherche sur grille affinée, ~1,5 ms).
3. **Vainqueur et confiance** = probabilités du marché. **Score exact et mi-temps** = cases les plus probables de la matrice de Poisson construite avec ces λ.

Aucun historique n'est nécessaire : un match « À venir » saisi avec ses cotes a une prédiction immédiatement.

### 2. Sans cotes : Double Poisson sur l'historique

Pour chaque équipe, on lit ses **10 derniers matchs terminés** dans la base, puis, avec `M = avgLeagueGoals` (2,5 par défaut, réglable via `VITE_AVG_LEAGUE_GOALS`) :

```
λ domicile  = (BM_dom / M) × (BE_ext / M) × M × 1,1
λ extérieur = (BM_ext / M) × (BE_dom / M) × M × 0,9
```

BM = buts marqués en moyenne, BE = buts encaissés en moyenne. Une équipe « moyenne » obtient λ = M × 1,1 : **M doit donc être la moyenne de buts par équipe et par match** (ex. 1,25 si la ligue fait 2,5 buts par match au total).

Dans les deux cas, le score exact le plus probable n'est pas forcé pour coller au vainqueur : la carte signale quand ils diffèrent. Sans cotes et avec moins de 3 matchs terminés par équipe, la carte affiche « Historique insuffisant ».

---

## Mise en production

### 1. Créer le projet Supabase

1. Créez un compte sur <https://supabase.com>, puis **New project** (choisissez une région proche, ex. *West EU (Paris)*).
2. Une fois le projet prêt : **Project Settings → API**. Notez :
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

   ⚠ N'utilisez jamais la clé `service_role` dans ce projet : les variables `VITE_*` sont visibles dans le JavaScript publié.

### 2. Exécuter le script SQL

> **Mise à jour depuis une version précédente** : relancez simplement `supabase/schema.sql` en entier. Il ajoute sans rien effacer les colonnes de cotes (`odds_home`, `odds_draw`, `odds_away`), la colonne `predictions.basis` et le contrôle des URL de logo.


1. **SQL Editor → New query**.
2. Collez le contenu de [`supabase/schema.sql`](supabase/schema.sql), puis cliquez sur **Run**.
   Le script crée `teams`, `matches`, `predictions` et `admins`, active la sécurité RLS (lecture publique, écriture réservée aux admins), active le temps réel sur `matches` et insère les 18 équipes de départ. Il peut être relancé sans risque.

### 3. Créer le compte administrateur

1. **Authentication → Users → Add user → Create new user** : email + mot de passe, cochez *Auto Confirm User*.
2. Dans **SQL Editor**, autorisez ce compte (remplacez l'email) :

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'VOTRE_EMAIL_ADMIN@exemple.com';
   ```

3. Recommandé : **Authentication → Sign In / Providers → Email**, désactivez *Allow new users to sign up*.
   Même sans cela, un compte inscrit qui n'est pas dans `admins` ne peut rien écrire (RLS), mais autant fermer la porte.

Le panneau `/admin` utilise ce compte. Il n'y a pas de mot de passe codé en dur : il serait lisible par tous dans le bundle JavaScript.

### 4. Configurer les variables d'environnement

| Variable | Où la trouver | Obligatoire |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | oui |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public | oui |
| `VITE_AVG_LEAGUE_GOALS` | moyenne de buts de la ligue (défaut 2.5) | non |
| `VITE_API_BASE_URL` | URL du relais Melbet (défaut `/api/melbet`) | non |

- **En local** : dans `.env.local` (ignoré par git).
- **Sur Vercel / Netlify** : dans les réglages du projet (voir ci-dessous). Les variables sont intégrées **au moment du build** : après les avoir modifiées, relancez un déploiement. Les noms de l'intégration Supabase de Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_ANON_KEY`…) sont aussi acceptés.

### 5. Déployer

Le relais Melbet (`server/melbetProxy.ts`) sert deux routes, avec le même code en développement (`vite.config.ts`) et en production (fonction serverless) :

| Route | Appel Melbet | Réponse |
|---|---|---|
| `/api/melbet/ChampsBySport?…` | `ChampsBySport` (liste des matchs) | JSON Melbet brut, cache CDN 15 s |
| `/api/melbet-odds?gameId=123` | `GetGame?gameId=123&cfView=3&fcountry=96&gr=2710&lng=fr_FR&ref=8&whence=22` | `{ "home": 1.85, "draw": 3.6, "away": 4.1 }`, cache CDN 20 s |

Le relais ajoute les en-têtes Melbet et coupe au bout de 8 s. `gameId` doit être un entier, sinon il répond 400. Il répond 404 si le marché 1X2 (groupe 1, types 1/2/3) est absent, et 502 ou 504 si Melbet refuse ou ne répond pas.
Le front demande les cotes des matchs à venir qui n'en ont pas, avec 4 requêtes en parallèle, 30 matchs au maximum et un cache de 60 s.

#### Option recommandée — Cloudflare Pages

Le dépôt contient déjà les fonctions Cloudflare : `functions/api/melbet/[[path]].ts` et `functions/api/melbet-odds.ts`. Elles réutilisent le relais commun. `.node-version` fixe Node 22 pour le build. Aucun fichier `_redirects` n'est nécessaire : sans `404.html`, Cloudflare sert `index.html` pour `/admin` et les autres routes (mode application monopage).

1. Tableau de bord Cloudflare → **Workers & Pages → Create → Pages → Connect to Git**, puis choisissez le dépôt `couture-clientes`.
2. **Production branch** : la branche principale du dépôt (`ccr-7de4b535-lu0o3h`).
3. **Build settings** :
   - *Framework preset* : `Vite` (ou `None`)
   - *Build command* : `npm run build`
   - *Build output directory* : `dist`
   - *Root directory* : laisser vide
4. **Environment variables (advanced)** → ajoutez, pour l'environnement **Production** :
   - `VITE_SUPABASE_URL` = `https://xxxx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = clé *anon public* ou *publishable*

   Ce sont des variables **de build** : ajoutez-les en type *Text* (pas *Secret*) avant le premier déploiement. Si vous les ajoutez après, relancez le déploiement : *Deployments → ⋯ → Retry deployment*.
5. **Save and Deploy**. Le site est publié sur `https://<projet>.pages.dev`. Ensuite, *Custom domains* permet d'y associer votre domaine.

Vérifications :

- le log de build contient `[MLK] ✓ Supabase configuré (…)` ;
- `https://<projet>.pages.dev/api/melbet-odds?gameId=abc` renvoie **400** en JSON ;
- `https://<projet>.pages.dev/admin` affiche l'écran de connexion.

En ligne de commande, sans Git :

```bash
npm run build
```

```bash
npx wrangler pages deploy dist --project-name mlk-fifa-virtuel
```

(`wrangler pages deploy` envoie aussi le dossier `functions/`. Les variables Supabase doivent alors être définies dans votre terminal au moment du `npm run build`.)

> Melbet peut bloquer les adresses IP de Cloudflare comme celles de Vercel. Si `/api/melbet/…` renvoie 502 en ligne, le site continue de fonctionner avec les matchs saisis dans `/admin`.

#### Option A — Vercel

1. Poussez le dépôt sur GitHub.
2. <https://vercel.com/new> → importez le dépôt. Le framework **Vite** est détecté (`vercel.json` fixe `npm run build` et `dist`).
3. **Settings → Environment Variables** : ajoutez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (Production + Preview).
4. **Deploy**. `vercel.json` route `/api/melbet/*` et `/api/melbet-odds` vers `api/melbet.ts`, et toutes les autres routes (dont `/admin`) vers `index.html`.

En ligne de commande :

```bash
npm i -g vercel
```

```bash
vercel --prod
```

#### Option B — Netlify

1. <https://app.netlify.com> → **Add new site → Import an existing project** → choisissez le dépôt.
   `netlify.toml` fixe la commande (`npm run build`), le dossier publié (`dist`) et les fonctions (`netlify/functions`).
2. **Site configuration → Environment variables** : ajoutez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
3. **Deploy**. La fonction `melbet` répond sur `/api/melbet/*` et `/api/melbet-odds` (`config.path`), et les autres routes renvoient `index.html`.

#### Le site sort en « mode démo » (Cloudflare, Vercel ou Netlify)

Le mode démo signifie que l'URL ou la clé Supabase était **absente au moment du build**. Le bandeau du site indique la variable manquante, et le log de build (Cloudflare : *Deployments → View details* ; Vercel : *Deployments → (le déploiement) → Building*) affiche l'une de ces lignes :

```
[MLK] ⚠ Supabase NON configuré — le site sera en MODE DÉMO. Variables manquantes : …
[MLK] ✓ Supabase configuré (VITE_SUPABASE_URL → https://xxxx.supabase.co, clé : VITE_SUPABASE_ANON_KEY)
```

Causes possibles, par ordre de fréquence :

1. **Variables ajoutées après le déploiement.** Elles ne sont lues qu'au build. Relancez un déploiement : Cloudflare *Deployments → ⋯ → Retry deployment* ; Vercel *Deployments → ⋯ → Redeploy*, en décochant *Use existing Build Cache*.
2. **Mauvais environnement.** La variable doit être cochée pour **Production** (et Preview si besoin), pas seulement Development.
3. **Nom mal orthographié.** Noms acceptés :
   - URL : `VITE_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` ou `SUPABASE_URL` ;
   - clé : `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY`, etc.

   Les noms créés par l'intégration Supabase de Vercel conviennent donc aussi.
4. **Mauvaise clé.** Utilisez la clé **anon public** (onglet *Legacy API keys*) ou **publishable** (`sb_publishable_…`). Une clé secrète (`service_role` ou `sb_secret_…`) **fait échouer le build** volontairement : elle serait publiée dans le JavaScript du site.

Les espaces, les guillemets, un `/` final ou un `https://` manquant dans l'URL sont corrigés automatiquement.

#### Vérification après déploiement

- `https://<votre-site>/api/melbet/ChampsBySport?sportIds=85` doit renvoyer du JSON (ou une erreur 4xx/5xx de Melbet, mais pas la page HTML du site).
- `https://<votre-site>/api/melbet-odds?gameId=abc` doit renvoyer **400** en JSON (preuve que la route est active).
- Le header affiche **API connectée** et **Base connectée**.
- `/admin` → connexion → saisissez un match : la page publique se met à jour toute seule (temps réel Supabase).

> Melbet peut bloquer les adresses IP des datacenters ou certains pays. Si le relais renvoie 403 ou 502 en production alors qu'il fonctionne en local, choisissez une région de fonction proche de la cible (Vercel : *Settings → Functions → Region* ; Netlify : *Functions region*). Les relais Vercel et Netlify ont été testés unitairement, mais pas sur une plateforme réelle.

---

## Fonctionnement des données

| Situation | Matchs affichés | Prédiction |
|---|---|---|
| API Melbet OK + Supabase configuré | matchs de l'API **+** matchs saisis dans `/admin` (sans doublon) | cotes si disponibles, sinon historique Supabase |
| API Melbet bloquée + Supabase configuré | matchs « À venir » saisis dans `/admin` | cotes saisies, sinon historique Supabase |
| Supabase non configuré | API Melbet, sinon données de test | cotes, sinon historique simulé (mode démo) |
| Base vide et API bloquée | « Aucune donnée » | — |

Un match saisi dans `/admin` et aussi renvoyé par l'API n'apparaît qu'une fois : mêmes équipes, alias compris, et moins de 30 min d'écart. Si l'API n'a pas de cotes pour ce match, ce sont les cotes saisies qui sont utilisées. Ces matchs portent la mention « admin » sur leur carte.

## Panneau d'administration (`/admin`)

### Saisir un match « À venir » (quand l'API Melbet est bloquée)

1. Ouvrez `https://<votre-site>/admin` et connectez-vous avec le compte admin.
2. Dans **Saisir un match**, choisissez le statut **À venir**.
3. Renseignez les champs obligatoires (*) : **Domicile**, **Extérieur**, **Date**, **Heure** (heure locale de votre navigateur). Aucun score n'est demandé.
4. *Optionnel :* renseignez les **cotes 1X2** relevées sur un autre site (ex. `1.85`, `3,60`, `4.10`). Il faut les trois cotes ou aucune, chacune supérieure à 1.
   - Avec cotes, la prédiction est disponible tout de suite, même pour des équipes sans historique.
   - Sans cotes, elle se base sur l'historique : il faut au moins 3 matchs terminés par équipe.
5. L'**aperçu** sous le formulaire montre la prédiction qui sera publiée (vainqueur, confiance, score exact et sa base de calcul).
6. Cliquez sur **Publier le match à venir**. Le match apparaît aussitôt sur la page publique (temps réel Supabase), et sa prédiction est enregistrée dans `predictions`.

Un match « À venir » ne peut pas être daté de plus de 15 min dans le passé : c'est un garde-fou contre une erreur de date ou d'heure.

### Après le match : saisir le résultat

Dans **Derniers matchs saisis**, cliquez sur **Résultat** sur la ligne du match. Le formulaire passe en mode « Saisir le résultat » avec les équipes et la date pré-remplies. Entrez le score final et le score à la mi-temps, puis **Enregistrer le résultat**. Le même match passe à « Terminé », sans doublon, et alimente l'historique des deux équipes.

### Autres actions

- **Saisir un match terminé** : statut **Terminé**, équipes, date, heure, score final et score à la mi-temps. Les mêmes règles sont vérifiées dans le formulaire et en SQL : deux équipes distinctes, mi-temps ≤ score final.
- **Supprimer** : sur une ligne de la liste, en deux clics.
- **Équipes & logos** : choisissez **+ Nouvelle équipe** pour en créer une, ou une équipe existante pour lui associer une URL de logo (`https://…`). Un aperçu de l'écusson s'affiche. Laisser le champ vide retire le logo. Sur le site, l'image remplace l'écusson SVG ; si elle ne charge pas (lien cassé, hôte bloqué), l'écusson SVG reprend sa place.
- **Recalculer** : relance le calcul des prédictions de tous les matchs à venir de la base.

Après chaque ajout, modification ou suppression, les prédictions des matchs à venir de la base sont recalculées et ajoutées à `predictions`, l'historique est conservé, et le site public se met à jour via le temps réel Supabase.
