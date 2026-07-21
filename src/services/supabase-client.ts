import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readEnvironment } from '../config/environment';

export function createSupabaseClient(
  source: Record<string, unknown> = import.meta.env
): SupabaseClient {
  const environment = readEnvironment(source);

  return createClient(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    }
  ) as SupabaseClient;
}
