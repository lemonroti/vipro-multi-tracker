import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

function migration(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../supabase/migrations/${name}`, import.meta.url)),
    'utf8'
  ).toLowerCase();
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
});
