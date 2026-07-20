import { describe, expect, it } from 'vitest';
import { ConfigurationError, readEnvironment } from './environment';

describe('readEnvironment', () => {
  it('reads valid public Supabase configuration', () => {
    expect(readEnvironment({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example'
    })).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabasePublishableKey: 'sb_publishable_example'
    });
  });

  it.each([
    [{ VITE_SUPABASE_PUBLISHABLE_KEY: 'key' }, 'missing URL'],
    [{ VITE_SUPABASE_URL: 'not-a-url', VITE_SUPABASE_PUBLISHABLE_KEY: 'key' }, 'invalid URL'],
    [{ VITE_SUPABASE_URL: 'https://example.supabase.co' }, 'missing key'],
    [{ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: '' }, 'empty key']
  ])('throws ConfigurationError for %s (%s)', (source, description) => {
    void description;
    expect(() => readEnvironment(source)).toThrow(ConfigurationError);
  });
});
