import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

function migration(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../supabase/migrations/${name}`, import.meta.url)),
    'utf8'
  ).toLowerCase();
}

function migrationBySuffix(suffix: string): string {
  const migrationsDirectory = fileURLToPath(
    new URL('../supabase/migrations/', import.meta.url)
  );
  const matches = readdirSync(migrationsDirectory)
    .filter(name => name.endsWith(suffix));
  const match = matches[0];

  if (matches.length !== 1 || match === undefined) {
    throw new Error(`Expected exactly one migration ending in ${suffix}, found ${matches.length}.`);
  }

  return migration(match);
}

describe('Supabase schema migrations', () => {
  test('the baseline preserves the verified production constraint and trigger names', () => {
    const sql = migration('20260717160052_create_multi_tracker_schema.sql');

    expect(sql).toContain('constraint trackers_user_id_name_key unique');
    expect(sql).toContain('create trigger trackers_set_updated_at');
    expect(sql).toContain('create trigger tracking_logs_set_updated_at');
    expect(sql).toContain('create trigger user_settings_set_updated_at');
  });

  test('the restore RPC validates required values before its first delete', () => {
    const sql = migration('20260721001520_atomic_restore.sql');
    const firstDelete = sql.indexOf('delete from public.tracking_logs');
    const requiredValidation = [
      "jsonb_typeof(trackers_payload) is distinct from 'array'",
      'or name is null',
      'or unit is null',
      'or icon is null',
      'or color is null',
      'or quick_values is null',
      'or source is null',
      'if settings_theme is null',
      "jsonb_typeof(settings_preferences) is distinct from 'object'",
      "jsonb_typeof(settings_dashboard_layout) is distinct from 'object'",
      "not (settings_preferences ? 'confirmdelete')"
    ];

    expect(firstDelete).toBeGreaterThan(0);
    for (const validation of requiredValidation) {
      const location = sql.indexOf(validation);
      expect(location, validation).toBeGreaterThan(0);
      expect(location, validation).toBeLessThan(firstDelete);
    }
  });

  test('the restore RPC uses invoker rights and authenticated-only execution', () => {
    const sql = migration('20260721001520_atomic_restore.sql');

    expect(sql).toContain('security invoker');
    expect(sql).not.toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('current_user_id uuid := (select auth.uid())');
    expect(sql).toContain('from public, anon, authenticated');
    expect(sql).toContain('to authenticated');
  });

  test('the option tracker migration adds the version 4 storage contracts', () => {
    const sql = migrationBySuffix('add_option_trackers.sql');

    expect(sql).toContain("input_type text not null default 'unit'");
    expect(sql).toContain('create table public.tracker_options');
    expect(sql).toContain('on delete cascade');
    expect(sql).toContain('save_tracker_with_options');
    expect(sql).toContain('security invoker');
    expect(sql).toContain('grant execute on function public.save_tracker_with_options');
    expect(sql).toContain('option_id uuid');
    expect(sql).toContain('restore_tracker_state');
  });

  test('the version 4 restore validates option data before deleting user state', () => {
    const sql = migrationBySuffix('add_option_trackers.sql');
    const restoreStart = sql.indexOf('create or replace function public.restore_tracker_state');
    const restoreSql = sql.slice(restoreStart);
    const firstDelete = restoreSql.indexOf('delete from public.tracking_logs');
    const requiredValidation = [
      "jsonb_typeof(options) is distinct from 'array'",
      "input_type not in ('unit', 'option')",
      'option_id is null',
      'option payload contains duplicate records',
      'log payload references an unknown option'
    ];

    expect(restoreStart).toBeGreaterThanOrEqual(0);
    expect(firstDelete).toBeGreaterThan(0);
    for (const validation of requiredValidation) {
      const location = restoreSql.indexOf(validation);
      expect(location, validation).toBeGreaterThan(0);
      expect(location, validation).toBeLessThan(firstDelete);
    }
  });

  test('the option tracker migration applies least-privilege ownership controls', () => {
    const sql = migrationBySuffix('add_option_trackers.sql');

    expect(sql).toContain('alter table public.tracker_options enable row level security');
    expect(sql).toContain('grant select, insert, update, delete on public.tracker_options to authenticated');
    expect(sql).not.toContain('grant select, insert, update, delete on public.tracker_options to anon');
    expect(sql).toContain('revoke execute on function public.save_tracker_with_options(jsonb, jsonb) from public, anon');
    expect(sql).toContain('revoke execute on function public.restore_tracker_state(jsonb, jsonb, jsonb) from public, anon');
    expect(sql).toContain('lock_tracker_input_type');
    expect(sql).toContain('tracking_logs_tracker_option_fkey');
  });
});
