# Élan — guide

Ouvre l'app **à côté de ce fichier** ([elan-roan.vercel.app](https://elan-roan.vercel.app) ou voir [README](../README.md) pour l'install).

**Fil** : zone visible à l'écran → code front → clic → API → stockage.

| Colonne | Signification |
|---------|----------------|
| **Tu vois** | Textes / boutons tels qu'à l'écran |
| **Front** | Fichiers où les retrouver |
| **Au clic / envoi** | Fonction → route API (si applicable) |
| **Données** | localStorage / Supabase ([stockage](#stockage)) |

---

## Écran 1 — Avant connexion

URL `/`.

### « Élan » (logo header)

| | |
|-|-|
| **Tu vois** | Carré teal + **Élan** |
| **Front** | `components/Welcome.tsx` · `components/home/Branding.tsx` |
| **Action** | — |
| **Données** | — |

### « Chaque jour, un créneau. Élan s'occupe de ce qu'on y met. »

| | |
|-|-|
| **Tu vois** | Titre + paragraphe d'intro |
| **Front** | `components/Welcome.tsx` |
| **Action** | — |
| **Données** | — |

### « Commencer »

| | |
|-|-|
| **Tu vois** | Bouton teal **Commencer** → écran connexion |
| **Front** | `Welcome.tsx` → `components/SignIn.tsx` · `app/auth/callback/page.tsx` |
| **Au clic** | Auth **Supabase** — pas de route `/api/*` Élan |
| **Données** | Login → `AuthProvider` → `hydrateFromSupabase()` dans `lib/store.ts` → tables `elan_threads`, `elan_sessions`, `elan_settings` |

---

## Écran 2 — Accueil (connecté)

Tout l'écran = **`app/page.tsx`** + morceaux dans `components/home/*`.

### Header — « Élan » + date

| | |
|-|-|
| **Tu vois** | **Élan** · date du jour à droite |
| **Front** | `app/page.tsx` · `Branding.tsx` |
| **Données** | — |

### « Ta séance du jour »

| | |
|-|-|
| **Tu vois** | « Bonjour. » · **Ta séance du jour** · « Pas de liste à gérer… » |
| **Front** | `app/page.tsx` (section carte blanche) |
| **Données** | Lit `useThreads()` · `useSettings()` → `lib/store.ts` |

*(Nouveau : **Commence par vider ta tête.** · « Bienvenue 👋 » — même endroit.)*

### « 5 min · 15 min · 30 min · 50 min » · « Sortie · Courses »

| | |
|-|-|
| **Tu vois** | Boutons durée + **Sortie** / **Courses** |
| **Front** | `components/home/SessionPick.tsx` · `pickDuration` / `pickContext` dans `page.tsx` |
| **Au clic** | **`POST /api/plan`** · `app/api/plan/route.ts` · prompts `lib/voice.ts` |
| **Données** | Lit trucs ouverts · cache **`elan.plan.v1`** (local seulement) |

### Bandeau « Élan te conseille pour aujourd'hui »

| | |
|-|-|
| **Tu vois** | Label teal + paragraphe conseil (ou **Élan réfléchit…**) |
| **Front** | `app/page.tsx` · effet `useEffect` plan |
| **Au chargement** | **`POST /api/plan`** |
| **Données** | JSON `{ message, pick }` · trucs depuis `elan.threads.v1` / `elan_threads` |

### « Commencer la séance »

| | |
|-|-|
| **Tu vois** | Gros bouton teal |
| **Front** | `page.tsx` · `startFresh()` |
| **Au clic** | Affiche `components/Session.tsx` — pas d'API immédiate |
| **Données** | Bientôt **`elan.active.v1`** (séance en cours, local) |

### « Quoi de neuf ? Dépose, raconte, ou demande-moi. »

| | |
|-|-|
| **Tu vois** | Zone texte · **Envoyer** |
| **Front** | `page.tsx` · `sendPoint()` |
| **Au clic** | ① **`POST /api/chat`** · ② **`POST /api/reconcile`** · ops : `lib/ops.ts` → `applyThreadOps()` |
| **Données** | Chat → **`elan.chat.v1`** · trucs → **`elan.threads.v1`** + **`elan_threads`** |

### « ✓ N réglés aujourd'hui » + barres semaine

| | |
|-|-|
| **Tu vois** | Compteurs + graphique L–D |
| **Front** | `components/home/WeekMomentum.tsx` · `lib/week-stats.ts` |
| **Action** | **Aucune API** |
| **Données** | Trucs `done` avec **`doneAt`** |

### « Je garde N trucs à faire »

| | |
|-|-|
| **Tu vois** | Compteur · **y jeter un œil** · ✓ sur une ligne |
| **Front** | `components/home/BacklogPeek.tsx` · `components/ThreadRow.tsx` |
| **Au clic ✓** | `patch()` dans `lib/store.ts` — **pas d'API** |
| **Données** | `status: "done"` → **`elan_threads`** |

### « Se déconnecter »

| | |
|-|-|
| **Front** | `page.tsx` · `signOut()` |
| **Au clic** | Retour écran Welcome |

---

## Écran 3 — Séance plein écran

Composant **`components/Session.tsx`**.

### Minuteur · « Terminer »

| | |
|-|-|
| **Tu vois** | `14:32 sur 15 min` · **Pause** · **Terminer** (ou **Sortie** / **Courses** sans chrono) |
| **Front** | `Session.tsx` header |
| **Au clic Terminer** | `endSession()` dans `page.tsx` · bannière **Séance bouclée — N truc(s) réglé(s) 🎉** |
| **Données** | Log → **`elan.sessions.v1`** + **`elan_sessions`** · efface **`elan.active.v1`** |

### Messages « Élan » (stream)

| | |
|-|-|
| **Tu vois** | Point teal · **Élan** · texte qui arrive mot à mot |
| **Front** | `Session.tsx` · `runTurn()` |
| **Ouverture / envoi** | **`POST /api/session`** · `app/api/session/route.ts` |
| **Données** | Sauvegarde continue → **`elan.active.v1`** |

### « Élan a mis à jour tes trucs »

| | |
|-|-|
| **Front** | `Session.tsx` · `reconcile()` |
| **Après ton message** | **`POST /api/reconcile`** |
| **Données** | **`elan_threads`** |

### « + un truc » · « Mes trucs (N) »

| | |
|-|-|
| **Front** | `QuickCapture.tsx` · `ThreadRow.tsx` |
| **Capture longue** | **`POST /api/tidy`** · `app/api/tidy/route.ts` |
| **Données** | `add()` → **`elan_threads`** |

### « Réponds au guide… »

| | |
|-|-|
| **Front** | `Session.tsx` · `send()` → `runTurn()` |
| **Au clic** | **`POST /api/session`** + reconcile |

---

## Récap API

| Route | Déclenchée par | Fichier |
|-------|----------------|---------|
| `POST /api/plan` | Accueil · durée / Sortie / Courses | `app/api/plan/route.ts` |
| `POST /api/chat` | Accueil · **Envoyer** | `app/api/chat/route.ts` |
| `POST /api/reconcile` | Après chat accueil ou message séance | `app/api/reconcile/route.ts` |
| `POST /api/session` | Séance · ouverture + messages | `app/api/session/route.ts` |
| `POST /api/tidy` | Capture verbeuse en séance | `app/api/tidy/route.ts` |

Ton et règles communes : **`lib/voice.ts`**. Reconcile renvoie des ops (`done`, `add`, `note`…) validées par **`lib/ops.ts`**.  
Changement logique plan → incrémenter **`PLAN_VERSION`** dans `lib/constants.ts`.

---

## Stockage

Écriture client : **`lib/store.ts`**. Modèle : **`lib/types.ts`**. SQL : [supabase-schema.sql](./supabase-schema.sql).

| Donnée | localStorage | Supabase |
|--------|--------------|----------|
| Trucs | `elan.threads.v1` | `elan_threads` |
| Séances | `elan.sessions.v1` | `elan_sessions` |
| Réglages | `elan.settings.v1` | `elan_settings` |
| Séance en cours | `elan.active.v1` | — |
| Chat accueil | `elan.chat.v1` | — |
| Cache plan | `elan.plan.v1` | — |

Un **truc** = `Thread` (`open` · `done` · `snoozed`). Contexte séance : `desk` · `sortie` · `courses`.
