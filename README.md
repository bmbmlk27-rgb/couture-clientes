# MLK FIFA Virtuel

Prédictions de football virtuel (FC 26 · Championnat d'Allemagne) par modèle **Double Poisson**.
React + TypeScript (Vite), Tailwind CSS, Framer Motion, Lucide React, Supabase.

```
src/lib/predictionEngine.ts   moteur Double Poisson
src/lib/db.ts                 requêtes Supabase (historique, matchs, prédictions)
src/lib/supabase.ts           client Supabase (lit les variables d'environnement)
src/admin/                    panneau /admin
server/melbetProxy.ts         relais API Melbet (partagé Vercel / Netlify)
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

## Le modèle

Pour chaque équipe, on lit ses **10 derniers matchs terminés** dans la base, puis, avec `M = avgLeagueGoals` (2,5 par défaut, réglable via `VITE_AVG_LEAGUE_GOALS`) :

```
λ domicile  = (BM_dom / M) × (BE_ext / M) × M × 1,1
λ extérieur = (BM_ext / M) × (BE_dom / M) × M × 0,9
```

BM = buts marqués en moyenne, BE = buts encaissés en moyenne. La matrice de Poisson 0–8 × 0–8 donne :

- **le score exact le plus probable** (case maximale, plus de correction manuelle) ;
- **le vainqueur** = l'issue 1 / N / 2 dont la somme des probabilités est la plus forte, la confiance étant cette probabilité.

Les deux peuvent différer (ex. score exact 2-2 alors que « Domicile » est l'issue la plus probable) ; la carte l'indique.
Une équipe avec moins de 3 matchs terminés n'a pas de prédiction (« Historique insuffisant »).

---

## Mise en production

### 1. Créer le projet Supabase

1. Créez un compte sur <https://supabase.com>, puis **New project** (choisissez une région proche, ex. *West EU (Paris)*).
2. Une fois le projet prêt : **Project Settings → API**. Notez :
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

   ⚠ N'utilisez jamais la clé `service_role` dans ce projet : les variables `VITE_*` sont visibles dans le JavaScript publié.

### 2. Exécuter le script SQL

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
- **Sur Vercel / Netlify** : dans les réglages du projet (voir ci-dessous). Les variables `VITE_*` sont intégrées **au moment du build** : après les avoir modifiées, relancez un déploiement.

### 5. Déployer

Le front appelle toujours `/api/melbet/ChampsBySport?...`. En développement, c'est le proxy de `vite.config.ts` qui répond ; en production, c'est une fonction serverless (`server/melbetProxy.ts`). Celle-ci ajoute les en-têtes Melbet, ne relaie que l'endpoint `ChampsBySport`, coupe au bout de 8 s et met la réponse en cache CDN 15 s.

#### Option A — Vercel

1. Poussez le dépôt sur GitHub.
2. <https://vercel.com/new> → importez le dépôt. Le framework **Vite** est détecté (`vercel.json` fixe `npm run build` et `dist`).
3. **Settings → Environment Variables** : ajoutez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (Production + Preview).
4. **Deploy**. `vercel.json` route `/api/melbet/*` vers `api/melbet.ts` et toutes les autres routes (dont `/admin`) vers `index.html`.

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
3. **Deploy**. La fonction `melbet` répond sur `/api/melbet/*` (`config.path`), et les autres routes renvoient `index.html`.

#### Vérification après déploiement

- `https://<votre-site>/api/melbet/ChampsBySport?sportIds=85` doit renvoyer du JSON (ou une erreur 4xx/5xx de Melbet, mais pas la page HTML du site).
- Le header affiche **API connectée** et **Base connectée**.
- `/admin` → connexion → saisissez un match : la page publique se met à jour toute seule (temps réel Supabase).

> Melbet peut bloquer les adresses IP des datacenters ou certains pays. Si le relais renvoie 403 ou 502 en production alors qu'il fonctionne en local, choisissez une région de fonction proche de la cible (Vercel : *Settings → Functions → Region* ; Netlify : *Functions region*). Les relais Vercel et Netlify ont été testés unitairement, mais pas sur une plateforme réelle.

---

## Fonctionnement des données

| Situation | Matchs affichés | Historique utilisé |
|---|---|---|
| API Melbet OK + Supabase configuré | API Melbet | Supabase (équipes reliées par nom/alias) |
| API Melbet en panne + Supabase configuré | matchs « À venir » / « En direct » saisis dans `/admin` | Supabase |
| Supabase non configuré | API Melbet, sinon données de test | simulé (mode démo) |
| Base vide | « Aucune donnée » | — |

Dans `/admin` :

- **Saisir un match** : équipes (listes déroulantes), statut, date, score final et score à la mi-temps. Les mêmes règles sont vérifiées dans le formulaire et en SQL (deux équipes distinctes, mi-temps ≤ score final).
- **Derniers matchs saisis** : bouton *Supprimer* (en deux clics).
- Après chaque ajout ou suppression, les prédictions des matchs à venir de la base sont recalculées et enregistrées dans `predictions` (l'historique est conservé). Le site public se recalcule via le temps réel Supabase.
- **Ajouter une équipe** : pour les clubs absents de la liste de départ. Un `logo_url` facultatif remplace l'écusson généré.
