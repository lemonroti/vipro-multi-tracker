import type { OfflineOperation } from '../domain/operations';
import { offlineOperationSchema } from '../domain/schemas';

const QUEUE_KEY_PREFIX = 'vipro-multi-tracker-queue-v3-';

function queueKey(userId: string): string {
  return `${QUEUE_KEY_PREFIX}${userId}`;
}

function cloneOperations(operations: OfflineOperation[]): OfflineOperation[] {
  return operations.map(operation => offlineOperationSchema.parse(operation));
}

function entityId(operation: OfflineOperation): string | null {
  return operation.type === 'saveSettings' ? null : operation.payload.id;
}

function matchingUpsertType(operation: OfflineOperation): OfflineOperation['type'] | null {
  if (operation.type === 'deleteTracker') return 'upsertTracker';
  if (operation.type === 'deleteLog') return 'upsertLog';
  return null;
}

export class OfflineQueue {
  constructor(private readonly storage: Storage) {}

  load(userId: string): OfflineOperation[] {
    const stored = this.storage.getItem(queueKey(userId));
    if (stored === null) return [];

    try {
      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];

      return parsed.flatMap(operation => {
        const result = offlineOperationSchema.safeParse(operation);
        return result.success ? [result.data] : [];
      });
    } catch {
      return [];
    }
  }

  enqueue(userId: string, operation: OfflineOperation): OfflineOperation[] {
    const nextOperation = offlineOperationSchema.parse(operation);
    const nextEntityId = entityId(nextOperation);
    let operations = this.load(userId);
    let replacementIndex = -1;

    if (nextEntityId !== null) {
      const upsertType = matchingUpsertType(nextOperation);
      replacementIndex = operations.findIndex(queuedOperation => (
        queuedOperation.type === nextOperation.type
        && entityId(queuedOperation) === nextEntityId
      ));
      operations = operations.filter(queuedOperation => {
        const queuedEntityId = entityId(queuedOperation);
        const sameOperation = queuedOperation.type === nextOperation.type
          && queuedEntityId === nextEntityId;
        const supersededUpsert = upsertType !== null
          && queuedOperation.type === upsertType
          && queuedEntityId === nextEntityId;
        return !sameOperation && !supersededUpsert;
      });
    }

    const replacesUpsert = replacementIndex >= 0
      && (nextOperation.type === 'upsertTracker' || nextOperation.type === 'upsertLog');
    if (replacesUpsert) {
      operations.splice(replacementIndex, 0, nextOperation);
    } else {
      operations.push(nextOperation);
    }
    return this.save(userId, operations);
  }

  remove(userId: string, operationId: string): OfflineOperation[] {
    const operations = this.load(userId)
      .filter(operation => operation.id !== operationId);
    return this.save(userId, operations);
  }

  incrementRetry(userId: string, operationId: string): OfflineOperation[] {
    const operations = this.load(userId).map(operation => (
      operation.id === operationId
        ? { ...operation, retryCount: operation.retryCount + 1 }
        : operation
    ));
    return this.save(userId, operations);
  }

  clear(userId: string): void {
    this.storage.removeItem(queueKey(userId));
  }

  private save(userId: string, operations: OfflineOperation[]): OfflineOperation[] {
    this.storage.setItem(queueKey(userId), JSON.stringify(operations));
    return cloneOperations(operations);
  }
}
