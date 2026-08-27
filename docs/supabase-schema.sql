-- Élan — schéma initial (à coller dans Supabase → SQL Editor → Run, UNE fois).
-- N'ajoute que des tables neuves préfixées "elan_" : ne lit, ne modifie ni ne
-- supprime aucune table existante. Isolation par utilisateur via RLS.

-- ── Trucs (threads) ────────────────────────────────────────────────
create table if not exists public.elan_threads (
  id            text primary key,                          -- id généré côté client
  user_id       uuid not null references auth.users(id) on delete cascade,
  text          text not null,
  kind          text not null default 'action',            -- 'action' | 'suivi'
  status        text not null default 'open',              -- 'open' | 'done' | 'snoozed'
  created_at    timestamptz not null default now(),
  due           timestamptz,
  effort        text,                                       -- 'S' | 'M' | 'L'
  energy        text,
  note          text,
  touched_at    timestamptz,
  done_at       timestamptz,
  snoozed_until timestamptz,
  planned_for timestamptz,
  project_id    text                                        -- rattachement facultatif à un projet
);
alter table public.elan_threads enable row level security;
create policy "own elan_threads" on public.elan_threads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists elan_threads_user_idx on public.elan_threads(user_id);
-- Migration d'une base existante : ajoute la colonne si elle manque.
alter table public.elan_threads add column if not exists project_id text;
alter table public.elan_threads add column if not exists done_at timestamptz;

-- ── Projets (chantiers plus gros, pour la vue semaine) ─────────────
create table if not exists public.elan_projects (
  id          text primary key,                            -- id généré côté client
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  status      text not null default 'active',              -- 'active' | 'paused' | 'done'
  created_at  timestamptz not null default now(),
  goal        text,                                         -- à quoi ça sert
  depends_on  jsonb,                                        -- ids des projets prérequis
  due         timestamptz
);
alter table public.elan_projects enable row level security;
create policy "own elan_projects" on public.elan_projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists elan_projects_user_idx on public.elan_projects(user_id);

-- ── Séances (historique) ───────────────────────────────────────────
create table if not exists public.elan_sessions (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  date         timestamptz not null default now(),
  duration_min int not null,
  transcript   jsonb not null default '[]'::jsonb
);
alter table public.elan_sessions enable row level security;
create policy "own elan_sessions" on public.elan_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists elan_sessions_user_idx on public.elan_sessions(user_id);
alter table public.elan_sessions add column if not exists context text;

-- ── Réglages (un par utilisateur) ──────────────────────────────────
create table if not exists public.elan_settings (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  default_duration_min int not null default 15,
  name                 text,
  updated_at           timestamptz not null default now()
);
alter table public.elan_settings enable row level security;
create policy "own elan_settings" on public.elan_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter table public.elan_settings add column if not exists notify_enabled boolean not null default false;
alter table public.elan_settings add column if not exists notify_time text not null default '09:00';
alter table public.elan_settings add column if not exists notify_timezone text not null default 'Europe/Paris';
alter table public.elan_settings add column if not exists notify_last_sent date;
alter table public.elan_settings add column if not exists notify_email_enabled boolean not null default false;
alter table public.elan_settings add column if not exists day_plan jsonb;
alter table public.elan_settings add column if not exists situation text;
alter table public.elan_settings add column if not exists situation_until text;

-- ── Web Push (notifs rituel, app fermée) ───────────────────────────
create table if not exists public.elan_push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
alter table public.elan_push_subscriptions enable row level security;
create policy "own elan_push_subscriptions" on public.elan_push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists elan_push_subscriptions_user_idx
  on public.elan_push_subscriptions(user_id);

-- ── Événements d'usage (passages, séances, dwell) ──────────────────
-- kind : 'open' | 'session' | 'aside' | 'dwell'
-- day  : jour calendaire local YYYY-MM-DD (pas UTC)
create table if not exists public.elan_events (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null,
  at            timestamptz not null default now(),
  duration_sec  int,
  day           text not null
);
alter table public.elan_events enable row level security;
create policy "own elan_events" on public.elan_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists elan_events_user_idx
  on public.elan_events(user_id, at desc);
create unique index if not exists elan_events_open_day
  on public.elan_events(user_id, day) where kind = 'open';
create unique index if not exists elan_events_dwell_day
  on public.elan_events(user_id, day) where kind = 'dwell';
alter table public.elan_events add column if not exists meta jsonb;

-- ── Retours utilisateur ────────────────────────────────────────────
create table if not exists public.elan_feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  message    text not null,
  mood       text,
  source     text not null,
  created_at timestamptz not null default now()
);
alter table public.elan_feedback enable row level security;
create policy "own elan_feedback insert" on public.elan_feedback
  for insert with check (auth.uid() = user_id);
create policy "own elan_feedback select" on public.elan_feedback
  for select using (auth.uid() = user_id);
create index if not exists elan_feedback_user_idx
  on public.elan_feedback(user_id, created_at desc);

-- ── Cron rappel rituel (Supabase pg_cron → API Vercel) ───────────────
-- Même modèle qu'en-suspens : le timing est côté Supabase, pas Vercel
-- (plan Hobby Vercel = max 1 cron/jour).
--
-- Prérequis :
--   1. Vercel : CRON_SECRET, VAPID_*, SUPABASE_SERVICE_ROLE_KEY
--      Option mail : RESEND_API_KEY, RITUAL_EMAIL_FROM (ex. "Élan <rappel@ton-domaine.fr>")
--   2. Supabase → Database → Extensions : activer pg_cron + pg_net
--   3. Remplacer CRON_SECRET ci-dessous, puis Run (une fois).
--
-- Le cron tourne toutes les 5 min ; l'heure choisie est une fenêtre (ex. 9h15
-- → envoi entre 9h15 et 9h20), pas une minute exacte.

-- select cron.unschedule('elan-ritual-push');

select cron.schedule(
  'elan-ritual-push',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://elan-roan.vercel.app/api/cron/ritual',
    headers := '{"Authorization": "Bearer REMPLACE_PAR_TON_CRON_SECRET"}'::jsonb
  ) as request_id;
  $$
);
