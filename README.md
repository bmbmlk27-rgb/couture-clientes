# MLK FIFA Virtuel

Prédictions de football virtuel (FC 26 · Championnat d'Allemagne) par modèle **Double Poisson**.
React + TypeScript (Vite), Tailwind CSS, Framer Motion, Lucide React.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests du moteur et du parseur API
npm run build && npm run preview
```

## API Melbet / Xenvelop

Le navigateur ne peut pas appeler l'API directement (pas de CORS, et `user-agent` ne peut pas être forcé).
`vite.config.ts` expose un proxy `/api/melbet` → `https://n4vkteatv6x0.com/MainFeedLive/mobile/v3`
qui injecte les en-têtes requis (actif avec `npm run dev` et `npm run preview`).

En production sur un hébergement statique, mettez un proxy équivalent (Nginx, fonction serverless…)
et indiquez son URL via `VITE_API_BASE_URL`.

Gestion des erreurs (`src/lib/api.ts`) :
- HTTP 400 → nouvel essai avec des paramètres de ligue plus minimaux ;
- erreur réseau, délai de 8 s dépassé ou réponse vide → **fallback** sur les données de test (`src/data/mockMatches.ts`) ;
- nouvelle tentative automatique toutes les 60 s ; le statut est affiché dans le header (point vert ou rouge).

## Limites

- L'API ne fournit pas l'historique des équipes : les 10 derniers matchs sont **simulés de façon déterministe**
  (`src/data/teams.ts`). Remplacez `getTeamHistory` par une vraie source de résultats pour des prédictions significatives.
- Les écussons sont générés en SVG aux couleurs des clubs ; aucun logo officiel n'est inclus.
