import { z } from 'zod';

export interface Environment {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

export class ConfigurationError extends Error {
  constructor() {
    super('Invalid public Supabase configuration.');
    this.name = 'ConfigurationError';
  }
}

const environmentSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1)
});

export function readEnvironment(source: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(source);
  if (!result.success) throw new ConfigurationError();

  return {
    supabaseUrl: result.data.VITE_SUPABASE_URL,
    supabasePublishableKey: result.data.VITE_SUPABASE_PUBLISHABLE_KEY
  };
}
