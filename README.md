# Élan

Au lieu de gérer des listes de tâches, tu te présentes chaque jour à une **séance guidée par l'IA**. Elle prend le pouls de tout ce que tu as à faire, te fait avancer un pas à la fois, et te prévient avant que ça déborde. Pensé pour les cerveaux TDAH / la charge mentale qui s'accumule.

Le contrat : **tu ne parcours jamais ta liste toi-même.** Le guide la porte pour toi.

## Idées de base

- **Le fil** — tu déposes ce qui traîne, sans friction. Deux types : _à faire_ (action) et _à suivre_ (relance/veille). Détails (échéance, effort) optionnels.
- **La séance** — 25 min par défaut. Un guide (Claude) t'accueille, choisit quoi surfacer, et fait du body-doubling.
- **La régulation de charge** — si ça s'accumule, le guide propose 50 min ou un simple tri, plutôt que de te laisser te noyer.

## Lancer en local

1. Copie la config et ajoute ta clé Claude :
   ```bash
   cp .env.local.example .env.local
   # puis édite .env.local : ANTHROPIC_API_KEY=sk-ant-...
   ```
2. Démarre :
   ```bash
   npm run dev
   ```
3. Ouvre http://localhost:3000

## Stack

- Next.js 16 (App Router) + React 19 + Tailwind v4
- Claude (`claude-opus-4-8`) en streaming via `@anthropic-ai/sdk`, route `app/api/session`
- Persistance locale (localStorage) pour l'instant — une vraie base viendra pour la mémoire multi-appareils

## Prochaines étapes envisagées

- Mémoire persistante (le guide te connaît de séance en séance) → vrai moat
- Capture en langage naturel enrichie par l'IA (échéance/type/effort déduits)
- Le guide met à jour les fils lui-même (tool use)
- Notifications douces / rituel du matin
