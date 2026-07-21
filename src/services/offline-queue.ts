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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeLegacyOperation(operation: unknown): unknown {
  if (!isRecord(operation) || !isRecord(operation.payload)) return operation;

  if (operation.type === 'upsertTracker' && operation.payload.inputType === undefined) {
    return {
      ...operation,
      payload: {
        ...operation.payload,
        inputType: 'unit',
        options: []
      }
    };
  }

  if (operation.type === 'upsertLog' && operation.payload.recordType === undefined) {
    return {
      ...operation,
      payload: {
        ...operation.payload,
        recordType: 'unit',
        optionId: null
      }
    };
  }

  return operation;
}

function isRemovedOptionLog(
  operation: OfflineOperation,
  trackerId: string,
  retainedOptionIds: ReadonlySet<string>
): boolean {
  return operation.type === 'upsertLog'
    && operation.payload.recordType === 'option'
    && operation.payload.trackerId === trackerId
    && !retainedOptionIds.has(operation.payload.optionId);
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
        const result = offlineOperationSchema.safeParse(normalizeLegacyOperation(operation));
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
    let replacementPredecessors = new Set<OfflineOperation>();

    if (nextEntityId !== null) {
      const upsertType = matchingUpsertType(nextOperation);
      replacementIndex = operations.findIndex(queuedOperation => (
        queuedOperation.type === nextOperation.type
        && entityId(queuedOperation) === nextEntityId
      ));
      if (replacementIndex >= 0) {
        replacementPredecessors = new Set(operations.slice(0, replacementIndex));
      }
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

    if (nextOperation.type === 'upsertTracker' && nextOperation.payload.inputType === 'option') {
      const retainedOptionIds = new Set(nextOperation.payload.options.map(option => option.id));
      operations = operations.filter(operation => !isRemovedOptionLog(
        operation,
        nextOperation.payload.id,
        retainedOptionIds
      ));
    }

    const replacesUpsert = replacementIndex >= 0
      && (nextOperation.type === 'upsertTracker' || nextOperation.type === 'upsertLog');
    if (replacesUpsert) {
      const adjustedReplacementIndex = operations.filter(operation => (
        replacementPredecessors.has(operation)
      )).length;
      const dependentLogIndex = nextOperation.type === 'upsertTracker'
        && nextOperation.payload.inputType === 'option'
        ? operations.findIndex(operation => (
            operation.type === 'upsertLog'
            && operation.payload.recordType === 'option'
            && operation.payload.trackerId === nextOperation.payload.id
          ))
        : -1;
      operations.splice(
        dependentLogIndex >= 0
          ? Math.min(adjustedReplacementIndex, dependentLogIndex)
          : adjustedReplacementIndex,
        0,
        nextOperation
      );
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
