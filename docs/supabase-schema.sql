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
