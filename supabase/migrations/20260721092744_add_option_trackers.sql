alter table public.trackers
  add column input_type text not null default 'unit',
  alter column unit drop not null,
  alter column quick_values drop not null;

alter table public.trackers
  drop constraint trackers_unit_check,
  drop constraint trackers_daily_goal_check,
  drop constraint trackers_quick_values_check,
  add constraint trackers_input_type_check check (
    input_type in ('unit', 'option')
  ),
  add constraint trackers_input_fields_check check (
    (
      input_type = 'unit'
      and unit is not null
      and length(btrim(unit)) between 1 and 30
      and (daily_goal is null or daily_goal >= 0)
      and quick_values is not null
      and cardinality(quick_values) between 1 and 8
    )
    or (
      input_type = 'option'
      and unit is null
      and daily_goal is null
      and quick_values is null
    )
  ),
  add constraint trackers_user_id_id_key unique (user_id, id);

create table public.tracker_options (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tracker_id uuid not null references public.trackers(id) on delete cascade,
  label text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tracker_id, id),
  constraint tracker_options_user_tracker_fkey
    foreign key (user_id, tracker_id)
    references public.trackers(user_id, id)
    on delete cascade,
  constraint tracker_options_label_check check (
    label = btrim(label)
    and length(label) between 1 and 80
  ),
  constraint tracker_options_sort_order_check check (sort_order >= 0)
);

create unique index tracker_options_tracker_label_key
  on public.tracker_options (tracker_id, lower(label));

create index tracker_options_user_tracker_sort_idx
  on public.tracker_options (user_id, tracker_id, sort_order);

create index tracker_options_tracker_sort_idx
  on public.tracker_options (tracker_id, sort_order);

create or replace function public.enforce_tracker_option_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  option_count integer;
begin
  perform 1
  from public.trackers
  where trackers.id = new.tracker_id
    and trackers.user_id = new.user_id
    and trackers.input_type = 'option'
  for update;

  if not found then
    raise exception 'Option tracker ownership is invalid.' using errcode = '23514';
  end if;

  select count(*)
  into option_count
  from public.tracker_options
  where tracker_options.tracker_id = new.tracker_id
    and tracker_options.id <> new.id;

  if option_count >= 8 then
    raise exception 'A tracker can have at most eight options.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger tracker_options_enforce_limit
before insert or update on public.tracker_options
for each row execute function public.enforce_tracker_option_limit();

create trigger tracker_options_set_updated_at
before update on public.tracker_options
for each row execute function public.set_updated_at();

alter table public.tracking_logs
  add column option_id uuid,
  alter column value drop not null,
  drop constraint tracking_logs_value_check,
  add constraint tracking_logs_value_option_xor_check check (
    (
      value is not null
      and value > 0
      and option_id is null
    )
    or (
      value is null
      and option_id is not null
    )
  ),
  add constraint tracking_logs_tracker_option_fkey
    foreign key (tracker_id, option_id)
    references public.tracker_options(tracker_id, id)
    on delete cascade;

create index tracking_logs_option_occurred_idx
  on public.tracking_logs (option_id, occurred_at desc)
  where option_id is not null;

create or replace function public.lock_tracker_input_type()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.input_type is distinct from old.input_type
    and exists (
      select 1
      from public.tracking_logs
      where tracking_logs.tracker_id = old.id
    ) then
    raise exception 'Tracker input type cannot change after records exist.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trackers_lock_input_type
before update of input_type on public.trackers
for each row execute function public.lock_tracker_input_type();

alter table public.tracker_options enable row level security;

create policy tracker_options_select_own
on public.tracker_options
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy tracker_options_insert_own
on public.tracker_options
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.trackers
    where trackers.id = tracker_options.tracker_id
      and trackers.user_id = (select auth.uid())
      and trackers.input_type = 'option'
  )
);

create policy tracker_options_update_own
on public.tracker_options
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.trackers
    where trackers.id = tracker_options.tracker_id
      and trackers.user_id = (select auth.uid())
      and trackers.input_type = 'option'
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.trackers
    where trackers.id = tracker_options.tracker_id
      and trackers.user_id = (select auth.uid())
      and trackers.input_type = 'option'
  )
);

create policy tracker_options_delete_own
on public.tracker_options
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy logs_insert_own on public.tracking_logs;
drop policy logs_update_own on public.tracking_logs;

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
      and (
        (
          tracking_logs.option_id is null
          and trackers.input_type = 'unit'
        )
        or (
          tracking_logs.option_id is not null
          and trackers.input_type = 'option'
          and exists (
            select 1
            from public.tracker_options
            where tracker_options.id = tracking_logs.option_id
              and tracker_options.tracker_id = tracking_logs.tracker_id
              and tracker_options.user_id = (select auth.uid())
          )
        )
      )
  )
);

create policy logs_update_own
on public.tracking_logs
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.trackers
    where trackers.id = tracking_logs.tracker_id
      and trackers.user_id = (select auth.uid())
      and (
        (
          tracking_logs.option_id is null
          and trackers.input_type = 'unit'
        )
        or (
          tracking_logs.option_id is not null
          and trackers.input_type = 'option'
          and exists (
            select 1
            from public.tracker_options
            where tracker_options.id = tracking_logs.option_id
              and tracker_options.tracker_id = tracking_logs.tracker_id
              and tracker_options.user_id = (select auth.uid())
          )
        )
      )
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.trackers
    where trackers.id = tracking_logs.tracker_id
      and trackers.user_id = (select auth.uid())
      and (
        (
          tracking_logs.option_id is null
          and trackers.input_type = 'unit'
        )
        or (
          tracking_logs.option_id is not null
          and trackers.input_type = 'option'
          and exists (
            select 1
            from public.tracker_options
            where tracker_options.id = tracking_logs.option_id
              and tracker_options.tracker_id = tracking_logs.tracker_id
              and tracker_options.user_id = (select auth.uid())
          )
        )
      )
  )
);

revoke all on public.tracker_options from public, anon, authenticated;
grant select, insert, update, delete on public.tracker_options to authenticated;

create or replace function public.save_tracker_with_options(
  tracker_payload jsonb,
  options_payload jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  tracker_id_value uuid;
  tracker_name text;
  tracker_input_type text;
  tracker_unit text;
  tracker_icon text;
  tracker_color text;
  tracker_daily_goal numeric;
  tracker_quick_values numeric[];
  tracker_is_active boolean;
  tracker_sort_order integer;
  saved_row_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if jsonb_typeof(tracker_payload) is distinct from 'object'
    or jsonb_typeof(options_payload) is distinct from 'array' then
    raise exception 'Tracker save payload has an invalid structure.' using errcode = '22023';
  end if;

  if tracker_payload - array[
      'id', 'name', 'input_type', 'unit', 'icon', 'color', 'daily_goal',
      'quick_values', 'is_active', 'sort_order'
    ]::text[] <> '{}'::jsonb
    or not (tracker_payload ?& array[
      'id', 'name', 'input_type', 'unit', 'icon', 'color', 'daily_goal',
      'quick_values', 'is_active', 'sort_order'
    ]::text[]) then
    raise exception 'Tracker save payload contains invalid fields.' using errcode = '22023';
  end if;

  select tracker.id,
         tracker.name,
         tracker.input_type,
         tracker.unit,
         tracker.icon,
         tracker.color,
         tracker.daily_goal,
         tracker.quick_values,
         tracker.is_active,
         tracker.sort_order
  into tracker_id_value,
       tracker_name,
       tracker_input_type,
       tracker_unit,
       tracker_icon,
       tracker_color,
       tracker_daily_goal,
       tracker_quick_values,
       tracker_is_active,
       tracker_sort_order
  from jsonb_to_record(tracker_payload) as tracker(
    id uuid,
    name text,
    input_type text,
    unit text,
    icon text,
    color text,
    daily_goal numeric,
    quick_values numeric[],
    is_active boolean,
    sort_order integer
  );

  if tracker_id_value is null
    or tracker_name is null
    or length(btrim(tracker_name)) not between 1 and 80
    or tracker_input_type is null
    or tracker_input_type not in ('unit', 'option')
    or tracker_icon is null
    or length(tracker_icon) not between 1 and 16
    or tracker_color is null
    or tracker_color !~ '^#[0-9A-Fa-f]{6}$'
    or tracker_is_active is null
    or tracker_sort_order is null then
    raise exception 'Tracker save payload contains invalid data.' using errcode = '22023';
  end if;

  if tracker_input_type = 'unit' and (
      tracker_unit is null
      or length(btrim(tracker_unit)) not between 1 and 30
      or tracker_daily_goal < 0
      or tracker_quick_values is null
      or cardinality(tracker_quick_values) not between 1 and 8
      or array_position(tracker_quick_values, null) is not null
      or not (0 < all (tracker_quick_values))
      or jsonb_array_length(options_payload) <> 0
    ) then
    raise exception 'Unit tracker payload contains invalid data.' using errcode = '22023';
  end if;

  if tracker_input_type = 'option' and (
      tracker_unit is not null
      or tracker_daily_goal is not null
      or tracker_quick_values is not null
      or jsonb_array_length(options_payload) not between 1 and 8
    ) then
    raise exception 'Option tracker payload contains invalid data.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(options_payload) as payload(item)
    where jsonb_typeof(item) is distinct from 'object'
      or item - array['id', 'label', 'sort_order', 'created_at']::text[] <> '{}'::jsonb
      or not (item ?& array['id', 'label', 'sort_order']::text[])
  ) then
    raise exception 'Option payload contains invalid fields.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(options_payload) as option(
      id uuid,
      label text,
      sort_order integer,
      created_at timestamptz
    )
    where id is null
      or label is null
      or label <> btrim(label)
      or length(label) not between 1 and 80
      or sort_order is null
      or sort_order < 0
  ) then
    raise exception 'Option payload contains invalid data.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(options_payload) as option(id uuid)
    group by id
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_to_recordset(options_payload) as option(label text)
    group by lower(label)
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_to_recordset(options_payload) as option(sort_order integer)
    group by sort_order
    having count(*) > 1
  ) then
    raise exception 'Option payload contains duplicate records.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.tracker_options
    join jsonb_to_recordset(options_payload) as option(id uuid)
      on option.id = tracker_options.id
    where tracker_options.user_id = current_user_id
      and tracker_options.tracker_id <> tracker_id_value
  ) then
    raise exception 'Option payload reuses an option from another tracker.' using errcode = '23503';
  end if;

  if exists (
    select 1
    from public.trackers
    where trackers.id = tracker_id_value
      and trackers.user_id = current_user_id
      and trackers.input_type <> tracker_input_type
      and exists (
        select 1
        from public.tracking_logs
        where tracking_logs.tracker_id = tracker_id_value
      )
  ) then
    raise exception 'Tracker input type cannot change after records exist.'
      using errcode = '23514';
  end if;

  insert into public.trackers (
    id,
    user_id,
    name,
    input_type,
    unit,
    icon,
    color,
    daily_goal,
    quick_values,
    is_active,
    sort_order
  )
  values (
    tracker_id_value,
    current_user_id,
    tracker_name,
    tracker_input_type,
    tracker_unit,
    tracker_icon,
    tracker_color,
    tracker_daily_goal,
    tracker_quick_values,
    tracker_is_active,
    tracker_sort_order
  )
  on conflict (id) do update
  set name = excluded.name,
      input_type = excluded.input_type,
      unit = excluded.unit,
      icon = excluded.icon,
      color = excluded.color,
      daily_goal = excluded.daily_goal,
      quick_values = excluded.quick_values,
      is_active = excluded.is_active,
      sort_order = excluded.sort_order
  where trackers.user_id = current_user_id;

  get diagnostics saved_row_count = row_count;
  if saved_row_count <> 1 then
    raise exception 'Tracker does not belong to the authenticated user.' using errcode = '42501';
  end if;

  delete from public.tracker_options
  where tracker_options.user_id = current_user_id
    and tracker_options.tracker_id = tracker_id_value
    and not exists (
      select 1
      from jsonb_to_recordset(options_payload) as option(id uuid)
      where option.id = tracker_options.id
    );

  insert into public.tracker_options (
    id,
    user_id,
    tracker_id,
    label,
    sort_order,
    created_at
  )
  select option.id,
         current_user_id,
         tracker_id_value,
         option.label,
         option.sort_order,
         coalesce(option.created_at, now())
  from jsonb_to_recordset(options_payload) as option(
    id uuid,
    label text,
    sort_order integer,
    created_at timestamptz
  )
  on conflict (id) do update
  set label = excluded.label,
      sort_order = excluded.sort_order
  where tracker_options.user_id = current_user_id
    and tracker_options.tracker_id = tracker_id_value;

  get diagnostics saved_row_count = row_count;
  if saved_row_count <> jsonb_array_length(options_payload) then
    raise exception 'One or more options do not belong to the tracker.' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.save_tracker_with_options(jsonb, jsonb) from public, anon;
grant execute on function public.save_tracker_with_options(jsonb, jsonb) to authenticated;

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
        'id', 'name', 'input_type', 'unit', 'icon', 'color', 'daily_goal',
        'quick_values', 'is_active', 'sort_order', 'created_at', 'options'
      ]::text[] <> '{}'::jsonb
      or not (item ?& array[
        'id', 'name', 'input_type', 'unit', 'icon', 'color', 'daily_goal',
        'quick_values', 'is_active', 'sort_order', 'options'
      ]::text[])
  ) then
    raise exception 'Tracker payload contains invalid fields.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(trackers_payload) as tracker(
      id uuid,
      name text,
      input_type text,
      unit text,
      icon text,
      color text,
      daily_goal numeric,
      quick_values numeric[],
      is_active boolean,
      sort_order integer,
      created_at timestamptz,
      options jsonb
    )
    where id is null
      or name is null
      or length(btrim(name)) not between 1 and 80
      or input_type is null
      or input_type not in ('unit', 'option')
      or icon is null
      or length(icon) not between 1 and 16
      or color is null
      or color !~ '^#[0-9A-Fa-f]{6}$'
      or is_active is null
      or sort_order is null
      or jsonb_typeof(options) is distinct from 'array'
      or (
        input_type = 'unit'
        and (
          unit is null
          or length(btrim(unit)) not between 1 and 30
          or daily_goal < 0
          or quick_values is null
          or cardinality(quick_values) not between 1 and 8
          or array_position(quick_values, null) is not null
          or not (0 < all (quick_values))
          or jsonb_array_length(options) <> 0
        )
      )
      or (
        input_type = 'option'
        and (
          unit is not null
          or daily_goal is not null
          or quick_values is not null
          or jsonb_array_length(options) not between 1 and 8
        )
      )
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
    from jsonb_array_elements(trackers_payload) as tracker(item)
    cross join lateral jsonb_array_elements(tracker.item -> 'options') as option(item)
    where jsonb_typeof(option.item) is distinct from 'object'
      or option.item - array['id', 'label', 'sort_order', 'created_at']::text[] <> '{}'::jsonb
      or not (option.item ?& array['id', 'label', 'sort_order']::text[])
  ) then
    raise exception 'Option payload contains invalid fields.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(trackers_payload) as tracker(item)
    cross join lateral jsonb_to_recordset(tracker.item -> 'options') as option(
      id uuid,
      label text,
      sort_order integer,
      created_at timestamptz
    )
    where option.id is null
      or option.label is null
      or option.label <> btrim(option.label)
      or length(option.label) not between 1 and 80
      or option.sort_order is null
      or option.sort_order < 0
  ) then
    raise exception 'Option payload contains invalid data.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(trackers_payload) as tracker(item)
    cross join lateral jsonb_to_recordset(tracker.item -> 'options') as option(id uuid)
    group by option.id
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(trackers_payload) as tracker(item)
    cross join lateral jsonb_to_recordset(tracker.item -> 'options') as option(label text)
    group by tracker.item ->> 'id', lower(option.label)
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(trackers_payload) as tracker(item)
    cross join lateral jsonb_to_recordset(tracker.item -> 'options') as option(sort_order integer)
    group by tracker.item ->> 'id', option.sort_order
    having count(*) > 1
  ) then
    raise exception 'Option payload contains duplicate records.' using errcode = '22023';
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
        'id', 'tracker_id', 'value', 'option_id', 'occurred_at', 'note',
        'source', 'client_id'
      ]::text[] <> '{}'::jsonb
      or not (item ?& array[
        'id', 'tracker_id', 'value', 'option_id', 'occurred_at', 'note',
        'source', 'client_id'
      ]::text[])
  ) then
    raise exception 'Log payload contains invalid fields.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(logs_payload) as log(
      id uuid,
      tracker_id uuid,
      value numeric,
      option_id uuid,
      occurred_at timestamptz,
      note text,
      source text,
      client_id text
    )
    where id is null
      or tracker_id is null
      or (value is null) = (option_id is null)
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

  if exists (
    select 1
    from jsonb_to_recordset(logs_payload) as log(tracker_id uuid, option_id uuid)
    where log.option_id is not null
      and not exists (
        select 1
        from jsonb_array_elements(trackers_payload) as tracker(item)
        cross join lateral jsonb_to_recordset(tracker.item -> 'options') as option(id uuid)
        where (tracker.item ->> 'id')::uuid = log.tracker_id
          and option.id = log.option_id
      )
  ) then
    raise exception 'Log payload references an unknown option.' using errcode = '23503';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(logs_payload) as log(
      tracker_id uuid,
      value numeric,
      option_id uuid
    )
    join jsonb_to_recordset(trackers_payload) as tracker(id uuid, input_type text)
      on tracker.id = log.tracker_id
    where (log.value is not null and tracker.input_type <> 'unit')
      or (log.option_id is not null and tracker.input_type <> 'option')
  ) then
    raise exception 'Log payload does not match its tracker input type.' using errcode = '22023';
  end if;

  if settings_payload - array[
    'theme', 'preferences', 'dashboard_layout'
  ]::text[] <> '{}'::jsonb
    or not (settings_payload ?& array[
      'theme', 'preferences', 'dashboard_layout'
    ]::text[]) then
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

  delete from public.tracker_options
  where user_id = current_user_id;

  delete from public.trackers
  where user_id = current_user_id;

  insert into public.trackers (
    id,
    user_id,
    name,
    input_type,
    unit,
    icon,
    color,
    daily_goal,
    quick_values,
    is_active,
    sort_order,
    created_at
  )
  select tracker.id,
         current_user_id,
         tracker.name,
         tracker.input_type,
         tracker.unit,
         tracker.icon,
         tracker.color,
         tracker.daily_goal,
         tracker.quick_values,
         tracker.is_active,
         tracker.sort_order,
         coalesce(tracker.created_at, now())
  from jsonb_to_recordset(trackers_payload) as tracker(
    id uuid,
    name text,
    input_type text,
    unit text,
    icon text,
    color text,
    daily_goal numeric,
    quick_values numeric[],
    is_active boolean,
    sort_order integer,
    created_at timestamptz
  );

  insert into public.tracker_options (
    id,
    user_id,
    tracker_id,
    label,
    sort_order,
    created_at
  )
  select option.id,
         current_user_id,
         (tracker.item ->> 'id')::uuid,
         option.label,
         option.sort_order,
         coalesce(option.created_at, now())
  from jsonb_array_elements(trackers_payload) as tracker(item)
  cross join lateral jsonb_to_recordset(tracker.item -> 'options') as option(
    id uuid,
    label text,
    sort_order integer,
    created_at timestamptz
  );

  insert into public.tracking_logs (
    id,
    user_id,
    tracker_id,
    value,
    option_id,
    occurred_at,
    note,
    source,
    client_id
  )
  select log.id,
         current_user_id,
         log.tracker_id,
         log.value,
         log.option_id,
         log.occurred_at,
         log.note,
         log.source,
         log.client_id
  from jsonb_to_recordset(logs_payload) as log(
    id uuid,
    tracker_id uuid,
    value numeric,
    option_id uuid,
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

revoke execute on function public.restore_tracker_state(jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.restore_tracker_state(jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.restore_tracker_state(jsonb, jsonb, jsonb) to authenticated;

revoke execute on function public.enforce_tracker_option_limit() from public, anon, authenticated;
revoke execute on function public.lock_tracker_input_type() from public, anon, authenticated;
