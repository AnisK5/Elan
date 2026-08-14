# Élan

Application web de séances guidées par l'IA — pensée pour ne pas gérer seul une liste infinie de choses à faire.

Tu déposes ce qui traîne. Élan propose un créneau (5 à 50 min, sortie, courses), t'accompagne pendant la séance, et garde le reste en arrière-plan.

**Démo** : [elan-roan.vercel.app](https://elan-roan.vercel.app)

---

## Architecture

```
Navigateur                         Vercel (serveur)
──────────                         ────────────────
app/page.tsx, components/*  ──►  app/api/plan|session|chat|reconcile|tidy
        │                                    │
        ▼                                    ▼
lib/store.ts  ◄── localStorage      Anthropic Claude
        │         (+ Supabase
        ▼          si connecté)
elan_threads · elan_sessions · elan_settings
```

| Couche | Dossier | Rôle |
|--------|---------|------|
| Interface | `app/`, `components/` | React — ce que tu vois |
| Persistance | `lib/store.ts` | localStorage + sync Supabase (**client**, pas serveur) |
| IA | `app/api/*` | Appels Claude, streaming |

Point d'entrée UI : **`app/page.tsx`**. Prompts partagés : **`lib/voice.ts`**.

---

## Démarrage rapide

```bash
git clone <repo>
cd elan
cp .env.local.example .env.local
# Renseigner ANTHROPIC_API_KEY dans .env.local
npm install
npm run dev
```

→ [http://localhost:3000](http://localhost:3000)

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `ANTHROPIC_API_KEY` | Oui | API Claude |
| `NEXT_PUBLIC_SUPABASE_*` | Non | Compte + sync |

Sans Supabase : **localStorage** uniquement. SQL (tables + cron push) : [docs/supabase-schema.sql](./docs/supabase-schema.sql).

**Web Push (rappel matin, app fermée)** — variables Vercel : `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`. Puis activer le cron Supabase (section finale du SQL).

---

## Documentation

**[docs/GUIDE.md](./docs/GUIDE.md)** — ouvre l'app à côté : chaque zone à l'écran → code front → clic → API → où c'est stocké.

---

## Structure

```
app/           Pages + routes API
components/    UI (accueil, séance, auth)
lib/           store, types, prompts, stats
docs/          GUIDE.md + supabase-schema.sql
public/        PWA
```

---

## Commandes

`npm run dev` · `npm run build` · `npm test` · `npm run lint`

**Stack** : Next.js 16 · React 19 · Tailwind v4 · Anthropic SDK · Supabase (optionnel) · Vercel
