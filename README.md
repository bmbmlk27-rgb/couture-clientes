# MLK FIFA Virtuel

Liste de tous les championnats FIFA virtuels de Melbet, avec leurs matchs et une prédiction calée sur les cotes :
séance de tirs au but pour les ligues « Penalty », match classique (Poisson) pour les autres.
React + TypeScript (Vite), Tailwind CSS, Framer Motion, Lucide React. Déployé sur Cloudflare Workers.

```
src/lib/penaltyEngine.ts      moteur de séance de tirs au but, calé sur les cotes
src/lib/matchEngine.ts        moteur de match classique (Poisson calé sur les cotes 1X2)
src/lib/odds.ts               cotes vainqueur (1X2 ou 2 issues), probabilités implicites
src/lib/api.ts                championnats et matchs (ChampsBySport, /api/melbet-league), cotes (GetGame)
src/hooks/useChampionships.ts  chargement, cotes et prédictions, rafraîchi toutes les 30 s
src/lib/matchMemory.ts        mémoire des matchs vus d'un appel à l'autre
server/melbetProxy.ts         relais API Melbet (partagé Cloudflare / Vercel / Netlify / dev)
worker/index.ts               Worker Cloudflare : relais Melbet + fichiers statiques
```

## Démarrage local

```bash
npm install
npm run dev     # http://localhost:5173
npm test
```

Aucune variable d'environnement n'est nécessaire.

## Matchs classiques (championnats hors Penalty)

Les buts attendus (λ dom., λ ext.) sont ajustés pour que les probabilités Poisson 1/N/2 collent aux cotes 1X2 (marge retirée, moindres carrés, scores jusqu'à 25 buts pour les formats 3x3/4x4/5x5). Vainqueur et confiance = probabilités du marché ; score exact et mi-temps = scores les plus probables. Il faut les cotes 1X2 complètes (avec le nul).

## Le modèle Penalty

### Déroulé d'une séance

Chaque équipe marque son tir avec une probabilité fixe (réussite dom. / ext.). Les équipes tirent en alternance, domicile en premier :

1. Série de 5 tirs chacune, arrêtée dès qu'une équipe ne peut plus être rattrapée (ex. 3-0 après 3 tirs chacune).
2. En cas d'égalité : mort subite, un tir chacune par tour, jusqu'à ce qu'une seule des deux marque.

La distribution **exacte** de tous les scores finaux est calculée (pas de tirage aléatoire).

### Calage sur les cotes Melbet

Les cotes viennent de `/api/melbet-odds` (GetGame, groupe 1). La marge du bookmaker est retirée : `pᵢ = (1/coteᵢ) / Σ(1/cote)`.

- **Cotes 1X2** : « N » est interprété comme l'égalité après les 5 tirs. On cherche les réussites (dom., ext.) dont les probabilités « victoire dom. / égalité / victoire ext. après 5 tirs » collent le mieux au marché (moindres carrés, grille affinée).
- **Cotes à 2 issues** : vainqueur final. Réussite dom. = 75 % + d, ext. = 75 % − d, avec d ajusté pour retrouver la probabilité du marché.

Sans cotes, la carte affiche « Cotes indisponibles » : aucune prédiction n'est inventée.

### Ce qu'affiche une carte

| Élément | Signification |
|---|---|
| Score exact | score final le plus probable (mort subite comprise) et sa probabilité |
| Autres scores | 2e et 3e scores les plus probables |
| Mort subite | probabilité d'égalité après 5 tirs |
| Barre 1 / 2 | probabilité de gagner la séance |
| Confiance / Vainqueur | équipe la plus probable et sa probabilité |
| « xx % de réussite » | réussite par tir estimée de chaque équipe |

Les matchs virtuels sont tirés au sort par un générateur : le modèle traduit les cotes en probabilités lisibles, il ne bat pas le bookmaker.

## API Melbet

| Route | Appel Melbet | Réponse |
|---|---|---|
| `/api/melbet/ChampsBySport?…` | `ChampsBySport` (liste des ligues et matchs) | JSON Melbet brut, cache 15 s |
| `/api/melbet-odds?gameId=123` | `GetGame?gameId=123&cfView=3&fcountry=96&gr=2710&lng=fr_FR&ref=8&whence=22` | `{ "home": 1.62, "away": 2.25 }` ou avec `"draw"` |
| `/api/melbet-odds?gameId=123&debug=1` | idem | réponse GetGame brute (diagnostic) |
| `/api/melbet-odds?probe=1` | ChampsBySport puis 5 variantes de GetGame | statut et début de chaque réponse (diagnostic) |
| `/api/melbet-league?champId=123` | variantes testées jusqu'à trouver les matchs de ce championnat | JSON Melbet brut, en-tête `x-melbet-variant` |
| `/api/melbet-league?champId=123&debug=1` | toutes les variantes | statut et début de chaque réponse (diagnostic) |

Le site appelle `ChampsBySport?cfView=3&fcountry=96&gr=2710&lng=fr_FR&ref=8&sportIds=85&whence=22` (sans `gr=2710`, Melbet répond 400) et lit la liste `mainLigas` (id, nom, pays, nombre de matchs). Cette réponse ne détaille les matchs que d'un championnat : pour les autres, le site appelle `/api/melbet-league`. Le relais y essaie plusieurs requêtes plausibles (`champIds=`, `champId=`, `GetChampGames`…) et garde la première qui renvoie bien des matchs de ce championnat ; si aucune ne marche, le championnat est affiché « détails indisponibles » (nouvel essai après 5 min).

**Mémoire des matchs (contournement).** Aucune requête testée ne renvoie aujourd'hui les matchs d'un championnat précis (`GamesByChamp` existe mais répond toujours 400). Comme `ChampsBySport` détaille un championnat différent d'un appel à l'autre, le site garde les matchs vus à chaque rafraîchissement (`src/lib/matchMemory.ts`) : jusqu'à 15 min après leur début, 30 par championnat. Leur statut est alors estimé d'après l'heure (« En cours · estimé », « Terminé · estimé ») et leur score n'est plus affiché. La mémoire vit dans l'onglet ouvert : elle se remplit au fil des minutes et repart de zéro au rechargement. Il lit les matchs au format mobile v3 (`opponent1.fullName`, `opponent2.fullName`, `startTs`, `nonStarted`, `scores`).

Le relais ajoute les en-têtes Melbet et coupe au bout de 8 s. `gameId` doit être un entier (sinon 400). Il répond 404 si le marché vainqueur est absent, 502/504 si Melbet refuse ou ne répond pas.

## Déploiement — Cloudflare Workers

`wrangler.toml` déclare le Worker `mlkfifa` : `worker/index.ts` relaie `/api/melbet/*` et `/api/melbet-odds`, et sert `dist` pour le reste.

Le Worker est relié au dépôt GitHub (Workers & Pages → mlkfifa) :

- *Build command* : `npm run build`
- *Deploy command* : `npx wrangler deploy`
- branche de production : la branche par défaut du dépôt. Chaque fusion la redéploie.

En ligne de commande :

```bash
npm run build
```

```bash
npx wrangler deploy
```

### Vérification après déploiement

- `https://mlkfifa.bmbmlk27.workers.dev/api/melbet-odds?gameId=abc` → **400** en JSON (le relais est actif).
- `https://mlkfifa.bmbmlk27.workers.dev/api/melbet/ChampsBySport?cfView=3&fcountry=96&gr=2710&lng=fr_FR&ref=8&sportIds=85&whence=22` → JSON Melbet.
- Si une carte reste « Cotes indisponibles » : ouvrir `/api/melbet-odds?gameId=<id>&debug=1` pour voir la réponse GetGame brute.

`vercel.json` (`api/melbet.ts`) et `netlify.toml` (`netlify/functions/melbet.ts`) permettent aussi un déploiement sur Vercel ou Netlify avec le même relais.
