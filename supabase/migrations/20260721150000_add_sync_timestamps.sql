alter table public.trackers
  add column if not exists updated_at timestamptz not null default now();

alter table public.tracking_logs
  add column if not exists updated_at timestamptz not null default now();

alter table public.user_settings
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trackers_set_updated_at on public.trackers;
create trigger trackers_set_updated_at
before update on public.trackers
for each row execute function public.set_updated_at();

drop trigger if exists tracking_logs_set_updated_at on public.tracking_logs;
create trigger tracking_logs_set_updated_at
before update on public.tracking_logs
for each row execute function public.set_updated_at();

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();
