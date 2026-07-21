create or replace function public.restore_tracker_state(
  trackers_payload jsonb,
  logs_payload jsonb,
  settings_payload jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  settings_theme text;
  settings_preferences jsonb;
  settings_dashboard_layout jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if jsonb_typeof(trackers_payload) is distinct from 'array'
    or jsonb_typeof(logs_payload) is distinct from 'array'
    or jsonb_typeof(settings_payload) is distinct from 'object' then
    raise exception 'Restore payload has an invalid structure.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(trackers_payload) as payload(item)
    where jsonb_typeof(item) is distinct from 'object'
  ) then
    raise exception 'Tracker payload must contain objects.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(trackers_payload) as payload(item)
    where item - array[
        'id', 'name', 'unit', 'icon', 'color', 'daily_goal', 'quick_values',
        'is_active', 'sort_order'
      ]::text[] <> '{}'::jsonb
  ) then
    raise exception 'Tracker payload contains invalid fields.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(trackers_payload) as tracker(
      id uuid,
      name text,
      unit text,
      icon text,
      color text,
      daily_goal numeric,
      quick_values numeric[],
      is_active boolean,
      sort_order integer
    )
    where id is null
      or name is null
      or length(btrim(name)) not between 1 and 80
      or unit is null
      or length(btrim(unit)) not between 1 and 30
      or icon is null
      or length(icon) not between 1 and 16
      or color is null
      or color !~ '^#[0-9A-Fa-f]{6}$'
      or daily_goal < 0
      or quick_values is null
      or cardinality(quick_values) not between 1 and 8
      or is_active is null
      or sort_order is null
  ) then
    raise exception 'Tracker payload contains invalid data.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(trackers_payload) as tracker(id uuid, name text)
    group by id
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_to_recordset(trackers_payload) as tracker(id uuid, name text)
    group by name
    having count(*) > 1
  ) then
    raise exception 'Tracker payload contains duplicate records.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(logs_payload) as payload(item)
    where jsonb_typeof(item) is distinct from 'object'
  ) then
    raise exception 'Log payload must contain objects.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(logs_payload) as payload(item)
    where item - array[
        'id', 'tracker_id', 'value', 'occurred_at', 'note', 'source', 'client_id'
      ]::text[] <> '{}'::jsonb
  ) then
    raise exception 'Log payload contains invalid fields.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(logs_payload) as log(
      id uuid,
      tracker_id uuid,
      value numeric,
      occurred_at timestamptz,
      note text,
      source text,
      client_id text
    )
    where id is null
      or tracker_id is null
      or value is null
      or value <= 0
      or occurred_at is null
      or length(note) > 500
      or source is null
      or length(source) not between 1 and 40
      or length(client_id) > 100
  ) then
    raise exception 'Log payload contains invalid data.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(logs_payload) as log(id uuid)
    group by id
    having count(*) > 1
  ) then
    raise exception 'Log payload contains duplicate records.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(logs_payload) as log(tracker_id uuid)
    where not exists (
      select 1
      from jsonb_to_recordset(trackers_payload) as tracker(id uuid)
      where tracker.id = log.tracker_id
    )
  ) then
    raise exception 'Log payload references an unknown tracker.' using errcode = '23503';
  end if;

  if settings_payload - array[
    'theme', 'preferences', 'dashboard_layout'
  ]::text[] <> '{}'::jsonb then
    raise exception 'Settings payload contains invalid fields.' using errcode = '22023';
  end if;

  select settings.theme, settings.preferences, settings.dashboard_layout
  into settings_theme, settings_preferences, settings_dashboard_layout
  from jsonb_to_record(settings_payload) as settings(
    theme text,
    preferences jsonb,
    dashboard_layout jsonb
  );

  if settings_theme is null
    or settings_theme not in ('system', 'light', 'dark')
    or jsonb_typeof(settings_preferences) is distinct from 'object'
    or jsonb_typeof(settings_dashboard_layout) is distinct from 'object'
    or settings_preferences - 'confirmDelete' <> '{}'::jsonb
    or not (settings_preferences ? 'confirmDelete')
    or jsonb_typeof(settings_preferences -> 'confirmDelete') is distinct from 'boolean' then
    raise exception 'Settings payload contains invalid data.' using errcode = '22023';
  end if;

  delete from public.tracking_logs
  where user_id = current_user_id;

  delete from public.trackers
  where user_id = current_user_id;

  insert into public.trackers (
    id,
    user_id,
    name,
    unit,
    icon,
    color,
    daily_goal,
    quick_values,
    is_active,
    sort_order
  )
  select
    tracker.id,
    current_user_id,
    tracker.name,
    tracker.unit,
    tracker.icon,
    tracker.color,
    tracker.daily_goal,
    tracker.quick_values,
    tracker.is_active,
    tracker.sort_order
  from jsonb_to_recordset(trackers_payload) as tracker(
    id uuid,
    name text,
    unit text,
    icon text,
    color text,
    daily_goal numeric,
    quick_values numeric[],
    is_active boolean,
    sort_order integer
  );

  insert into public.tracking_logs (
    id,
    user_id,
    tracker_id,
    value,
    occurred_at,
    note,
    source,
    client_id
  )
  select
    log.id,
    current_user_id,
    log.tracker_id,
    log.value,
    log.occurred_at,
    log.note,
    log.source,
    log.client_id
  from jsonb_to_recordset(logs_payload) as log(
    id uuid,
    tracker_id uuid,
    value numeric,
    occurred_at timestamptz,
    note text,
    source text,
    client_id text
  );

  insert into public.user_settings (
    user_id,
    theme,
    preferences,
    dashboard_layout
  )
  values (
    current_user_id,
    settings_theme,
    settings_preferences,
    settings_dashboard_layout
  )
  on conflict (user_id) do update
  set theme = excluded.theme,
      preferences = excluded.preferences,
      dashboard_layout = excluded.dashboard_layout;
end;
$$;

revoke all on function public.restore_tracker_state(jsonb, jsonb, jsonb)
from public, anon, authenticated;

grant execute on function public.restore_tracker_state(jsonb, jsonb, jsonb)
to authenticated;
