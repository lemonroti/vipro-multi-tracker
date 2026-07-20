import type { AuthService } from '../services/auth-service';
import { createAuthService } from '../services/auth-service';
import type {
  BackupLogRepository,
  BackupTrackerRepository
} from '../services/backup-service';
import type {
  BackupRepository,
  LogRepository,
  SettingsRepository,
  TrackerRepository
} from '../services/repository-types';
import {
  SupabaseBackupRepository,
  SupabaseLogRepository,
  SupabaseSettingsRepository,
  SupabaseTrackerRepository
} from '../services/supabase-repositories';
import { createSupabaseClient } from '../services/supabase-client';

export interface RuntimeRepositories {
  trackers: TrackerRepository & BackupTrackerRepository;
  logs: LogRepository & BackupLogRepository;
  settings: SettingsRepository;
  backup: BackupRepository;
}

export interface ApplicationRuntime {
  authService: AuthService;
  createRepositories: (userId: string) => RuntimeRepositories;
  createId: () => string;
  now: () => string;
}

export function createProductionRuntime(): ApplicationRuntime {
  const client = createSupabaseClient();
  return {
    authService: createAuthService(client),
    createRepositories(userId) {
      return {
        trackers: new SupabaseTrackerRepository(client, userId),
        logs: new SupabaseLogRepository(client, userId),
        settings: new SupabaseSettingsRepository(client, userId),
        backup: new SupabaseBackupRepository(client)
      };
    },
    createId: () => crypto.randomUUID(),
    now: () => new Date().toISOString()
  };
}
