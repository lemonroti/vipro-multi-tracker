create table public.trackers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  unit text not null,
  icon text not null default '◫',
  color text not null default '#6d4aff',
  daily_goal numeric,
  quick_values numeric[] not null default array[1]::numeric[],
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trackers_user_id_name_key unique (user_id, name),
  constraint trackers_name_check check (
    length(btrim(name)) between 1 and 80
  ),
  constraint trackers_unit_check check (
    length(btrim(unit)) between 1 and 30
  ),
  constraint trackers_icon_check check (
    length(icon) between 1 and 16
  ),
  constraint trackers_color_check check (
    color ~ '^#[0-9A-Fa-f]{6}$'
  ),
  constraint trackers_daily_goal_check check (
    daily_goal is null or daily_goal >= 0
  ),
  constraint trackers_quick_values_check check (
    cardinality(quick_values) between 1 and 8
  )
);

create index trackers_user_sort_idx
  on public.trackers (user_id, is_active desc, sort_order, created_at);

create table public.tracking_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tracker_id uuid not null references public.trackers(id) on delete cascade,
  value numeric not null,
  occurred_at timestamptz not null default now(),
  note text,
  source text not null default 'website',
  client_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracking_logs_value_check check (value > 0),
  constraint tracking_logs_note_check check (
    note is null or length(note) <= 500
  ),
  constraint tracking_logs_source_check check (
    length(source) between 1 and 40
  ),
  constraint tracking_logs_client_id_check check (
    client_id is null or length(client_id) <= 100
  )
);

create index tracking_logs_tracker_occurred_idx
  on public.tracking_logs (tracker_id, occurred_at desc);

create index tracking_logs_user_occurred_idx
  on public.tracking_logs (user_id, occurred_at desc);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system',
  dashboard_layout jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_theme_check check (
    theme in ('system', 'light', 'dark')
  )
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trackers_set_updated_at
before update on public.trackers
for each row execute function public.set_updated_at();

create trigger tracking_logs_set_updated_at
before update on public.tracking_logs
for each row execute function public.set_updated_at();

create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

alter table public.trackers enable row level security;
alter table public.tracking_logs enable row level security;
alter table public.user_settings enable row level security;

create policy trackers_select_own
on public.trackers
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy trackers_insert_own
on public.trackers
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy trackers_update_own
on public.trackers
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy trackers_delete_own
on public.trackers
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy logs_select_own
on public.tracking_logs
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy logs_insert_own
on public.tracking_logs
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.trackers
    where trackers.id = tracking_logs.tracker_id
      and trackers.user_id = (select auth.uid())
  )
);

create policy logs_update_own
on public.tracking_logs
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.trackers
    where trackers.id = tracking_logs.tracker_id
      and trackers.user_id = (select auth.uid())
  )
);

create policy logs_delete_own
on public.tracking_logs
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy settings_select_own
on public.user_settings
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy settings_insert_own
on public.user_settings
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy settings_update_own
on public.user_settings
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy settings_delete_own
on public.user_settings
for delete
to authenticated
using ((select auth.uid()) = user_id);

grant delete, insert, references, select, trigger, truncate, update
on table public.trackers, public.tracking_logs, public.user_settings
to anon, authenticated;
