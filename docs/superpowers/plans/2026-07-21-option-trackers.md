# Option Trackers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing tracker so users can choose Unit or Option and record one of 1–8 named options with the same timestamped, editable, offline-first workflow as numeric values.

**Architecture:** Keep one tracker, record, store, sync, and UI pipeline. Add discriminated Unit/Option domain variants, nest stable options inside option trackers, reference options from option records, and persist option definitions in a child table through an atomic tracker RPC. Existing version-3 data normalizes into version-4 Unit data without user action.

**Tech Stack:** Vite 8, TypeScript 6, Zod 4, Vitest 4, vanilla DOM controllers, Supabase/PostgreSQL with RLS, Playwright 1.61, localStorage cache and offline queue.

## Global Constraints

- Preserve all existing Unit tracker behaviour and production data.
- Option trackers accept 1–8 comma-separated, trimmed, case-insensitively unique labels of 1–80 characters.
- New trackers default to Unit; input type is locked after the tracker has any records.
- Option trackers have no unit, quick numeric values, daily goal, progress bar, session state, pairing, timer, or duration calculation.
- Option clicks record option identity and current timestamp immediately through the existing optimistic/offline flow.
- Renames keep stable option IDs and update labels shown by existing records; reorder preserves identity; confirmed removal deletes associated records atomically.
- The existing Dashboard, Trackers, History, record modal, notes, date/time editing, themes, responsive layout, backup, and RLS boundaries remain authoritative.
- State and JSON backup format become version 4; version 3 cache and backups remain importable as Unit-only data.
- Use two-space indentation, single-quoted TypeScript strings, semicolons, escaped user content, and Conventional Commits.
- Execute directly on the new `dev` branch as Vincent requested; do not create a worktree and do not deploy production.
- Explicitly grant only the authenticated Data API privileges needed by `tracker_options` and the tracker-save RPC; RLS remains mandatory and owner-scoped.
- Do not edit or commit `dist/`, secrets, credentials, or `.env` files.

---

## File Structure Map

**Create**

- `src/domain/tracker-options.ts`: parse, validate, and reconcile comma-separated labels with stable option IDs.
- `src/domain/tracker-options.test.ts`: option parsing and identity regression tests.
- `supabase/migrations/`: Task 2 creates the option-tracker migration with `npx supabase migration new add_option_trackers`; the CLI-reported path is authoritative.

**Modify by responsibility**

- `src/domain/models.ts`, `schemas.ts`, `defaults.ts`, `operations.ts`: version-4 Unit/Option contracts and legacy normalization.
- `src/services/row-mappers.ts`, `repository-types.ts`, `supabase-repositories.ts`: database rows, nested option loading, atomic tracker save, and option record persistence.
- `src/services/tracker-service.ts`, `log-service.ts`, `sync-service.ts`, `cloud-state-service.ts`: validated optimistic mutations and offline replay.
- `src/services/backup-service.ts`: version-3 compatibility, version-4 relationship validation, ID remapping, JSON/CSV, and restore.
- `src/main.ts`, `src/runtime/application-runtime.ts`, `src/testing/browser-fixture.ts`: composition and deterministic option fixtures.
- `src/features/trackers/index.ts`, `logs/index.ts`, `dashboard/index.ts`, `history/index.ts`: type-aware UI using the existing views.
- `index.html`, `src/styles/app.css`: conditional form controls and small card/form states.
- Existing colocated tests and `tests/migrations.test.ts`, `tests/e2e/*.spec.ts`: regression and acceptance coverage.

---

### Task 1: Introduce the version-4 domain model without changing Unit behaviour

**Files:**
- Create: `src/domain/tracker-options.ts`
- Create: `src/domain/tracker-options.test.ts`
- Modify: `src/domain/models.ts`
- Modify: `src/domain/schemas.ts`
- Modify: `src/domain/defaults.ts`
- Modify: `src/domain/operations.ts`
- Modify: every existing test/fixture factory returned by `rg -l "version: 3|value: [0-9]|presets:" src tests`
- Test: `src/domain/schemas.test.ts`
- Test: `src/state/app-store.test.ts`
- Test: `src/services/cache.test.ts`
- Test: `src/services/offline-queue.test.ts`

**Interfaces:**
- Produces: `TrackerOption`, `UnitTracker`, `OptionTracker`, `Tracker`, `UnitTrackingLog`, `OptionTrackingLog`, `TrackingLog`, and `AppState` version 4.
- Produces: `parseOptionLabels(raw: string): string[]` and `reconcileTrackerOptions(existing, labels, createId, now): TrackerOption[]`.
- Produces: discriminated `trackerSchema` and `trackingLogSchema`; `normalizeState` accepts legacy version 3 and current version 4.

- [ ] **Step 1: Write failing model, normalization, and option-helper tests**

Add cases that assert legacy data becomes Unit data and option reconciliation preserves identity:

```ts
const legacy = normalizeState({
  version: 3,
  trackers: [{
    id: 'tracker-1', name: 'Smoking', unit: 'cigarette', icon: '🚬',
    color: '#334155', goal: 8, presets: [1], active: true,
    sortOrder: 0, createdAt: NOW
  }],
  logs: [{
    id: 'log-1', trackerId: 'tracker-1', value: 1,
    occurredAt: NOW, note: '', source: 'website'
  }],
  settings: { theme: 'system', confirmDelete: true }
});

expect(legacy.version).toBe(4);
expect(legacy.trackers[0]).toMatchObject({ inputType: 'unit', options: [] });
expect(legacy.logs[0]).toMatchObject({ recordType: 'unit', optionId: null });
```

```ts
const existing: TrackerOption[] = [
  { id: 'sleep-id', label: 'Sleep', sortOrder: 0, createdAt: NOW },
  { id: 'wake-id', label: 'Wake', sortOrder: 1, createdAt: NOW }
];
expect(reconcileTrackerOptions(existing, ['Wake', 'Go to bed'], nextId, () => NOW))
  .toEqual([
    { id: 'wake-id', label: 'Wake', sortOrder: 0, createdAt: NOW },
    { id: 'sleep-id', label: 'Go to bed', sortOrder: 1, createdAt: NOW }
  ]);
```

- [ ] **Step 2: Run the focused tests and confirm the expected red state**

Run:

```powershell
npm run test -- src/domain/tracker-options.test.ts src/domain/schemas.test.ts
```

Expected: FAIL because the new types/helper and version-4 normalization do not exist.

- [ ] **Step 3: Add the exact discriminated domain contracts**

Define these public shapes in `src/domain/models.ts`:

```ts
export interface TrackerOption {
  id: string;
  label: string;
  sortOrder: number;
  createdAt: string;
}

interface TrackerBase {
  id: string;
  name: string;
  icon: string;
  color: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface UnitTracker extends TrackerBase {
  inputType: 'unit';
  unit: string;
  goal: number | null;
  presets: number[];
  options: [];
}

export interface OptionTracker extends TrackerBase {
  inputType: 'option';
  unit: null;
  goal: null;
  presets: [];
  options: TrackerOption[];
}

export type Tracker = UnitTracker | OptionTracker;

interface TrackingLogBase {
  id: string;
  trackerId: string;
  occurredAt: string;
  note: string;
  source: string;
}

export interface UnitTrackingLog extends TrackingLogBase {
  recordType: 'unit';
  value: number;
  optionId: null;
}

export interface OptionTrackingLog extends TrackingLogBase {
  recordType: 'option';
  value: null;
  optionId: string;
}

export type TrackingLog = UnitTrackingLog | OptionTrackingLog;

export interface AppState {
  version: 4;
  trackers: Tracker[];
  logs: TrackingLog[];
  settings: UserSettings;
}
```

- [ ] **Step 4: Implement option parsing and deterministic reconciliation**

In `src/domain/tracker-options.ts`, split on commas, trim, drop empty entries, reject zero/more-than-eight, labels over 80 characters, and case-insensitive duplicates with an `OptionValidationError`. Reconciliation must preserve case-insensitive matches first, then reuse unmatched old IDs in original order, then create IDs for surplus labels. Return options in submitted order with sequential `sortOrder`.

```ts
export class OptionValidationError extends Error {}

export function parseOptionLabels(raw: string): string[];

export function reconcileTrackerOptions(
  existing: TrackerOption[],
  labels: string[],
  createId: () => string,
  now: () => string
): TrackerOption[];
```

- [ ] **Step 5: Implement strict schemas and legacy normalization**

Use `z.discriminatedUnion('inputType', [unitTrackerSchema, optionTrackerSchema])` for trackers and `z.discriminatedUnion('recordType', [unitTrackingLogSchema, optionTrackingLogSchema])` for logs. `normalizeTracker` and `normalizeLog` treat missing discriminants as legacy Unit data. `blankState()` and every normalized state return `version: 4`. Preserve invalid-cache recovery behaviour.

- [ ] **Step 6: Make all existing Unit constructors explicit**

Update defaults, browser fixtures, and local test builders with the same compatibility fields:

```ts
inputType: 'unit',
options: []
```

and for numeric records:

```ts
recordType: 'unit',
optionId: null
```

Replace every asserted `version: 3` for live state with `version: 4`; retain explicit version-3 literals only in legacy-normalization/import tests.

- [ ] **Step 7: Run the complete Unit regression gate**

Run:

```powershell
npm run typecheck
npm run test
```

Expected: both exit 0; current Unit UI/service tests remain green before Option persistence is added.

- [ ] **Step 8: Commit the domain foundation**

```powershell
git add src/domain src/state src/testing src/services tests
git commit -m "feat: add option tracker domain model"
```

---

### Task 2: Add the additive Supabase schema and migration contracts

**Files:**
- Create: the CLI-reported migration path from `npx supabase migration new add_option_trackers`
- Modify: `tests/migrations.test.ts`

**Interfaces:**
- Consumes: version-4 tracker/option/log contracts from Task 1.
- Produces: `public.tracker_options`, nullable unit/value storage with XOR checks, composite option ownership, `save_tracker_with_options(jsonb,jsonb)`, and a version-4 `restore_tracker_state(jsonb,jsonb,jsonb)` contract.

- [ ] **Step 1: Generate the migration path, then write failing SQL contract tests**

First discover the installed CLI command and create the migration through the CLI:

```powershell
npx supabase migration new --help
npx supabase migration new add_option_trackers
```

Record the printed path in the task report. Add a `migrationBySuffix('add_option_trackers.sql')` test helper that requires exactly one matching file, then require these fragments:

```ts
expect(sql).toContain("input_type text not null default 'unit'");
expect(sql).toContain('create table public.tracker_options');
expect(sql).toContain('on delete cascade');
expect(sql).toContain('save_tracker_with_options');
expect(sql).toContain("security invoker");
expect(sql).toContain("grant execute on function public.save_tracker_with_options");
expect(sql).toContain('option_id uuid');
expect(sql).toContain('restore_tracker_state');
```

Also assert validation occurs before the first destructive `delete` inside the restore function.

- [ ] **Step 2: Run migration tests and confirm failure**

```powershell
npm run test -- tests/migrations.test.ts
```

Expected: FAIL because the new migration has not implemented the required contract.

- [ ] **Step 3: Implement the tables, constraints, indexes, and RLS**

The migration must:

```sql
alter table public.trackers
  add column input_type text not null default 'unit',
  alter column unit drop not null,
  alter column quick_values drop not null;

create table public.tracker_options (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tracker_id uuid not null references public.trackers(id) on delete cascade,
  label text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tracker_id, id)
);
```

Add type-dependent tracker checks, a case-insensitive unique index on `(tracker_id, lower(label))`, a trigger that rejects a ninth option, indexes for user/tracker order, and owner-scoped select/insert/update/delete RLS policies. Add `option_id` to `tracking_logs`, make `value` nullable, replace the positive-value check with an XOR constraint, and add composite FK `(tracker_id, option_id) -> tracker_options(tracker_id, id) on delete cascade`.

Grant `select, insert, update, delete` on `public.tracker_options` to `authenticated`; do not grant table access to `anon`. Revoke function execution from `public` and `anon`, then grant the tracker-save function only to `authenticated`.

- [ ] **Step 4: Add database enforcement for locked input type and ownership**

Create an invoker trigger that rejects changing `trackers.input_type` when any `tracking_logs` row exists. Strengthen log insert/update RLS so the tracker belongs to `auth.uid()` and any `option_id` belongs to the same tracker and user.

- [ ] **Step 5: Add atomic tracker save and version-4 restore functions**

`save_tracker_with_options(tracker_payload jsonb, options_payload jsonb)` must validate the complete payload before mutation, upsert the owner-scoped tracker, upsert submitted options, and delete omitted options in one transaction. Unit payloads require zero options; Option payloads require 1–8.

Replace the restore function body so it validates tracker type fields, nested option payloads, log XOR data, tracker-option ownership, IDs, settings, and duplicates before deleting anything. Insert trackers, options, logs, then settings in FK-safe order. Keep `security invoker`, blank `search_path`, revoke from public/anon, and grant only to authenticated.

- [ ] **Step 6: Run repository migration verification**

```powershell
npm run test -- tests/migrations.test.ts
git diff --check
```

Expected: exit 0. If local Docker is available, additionally run:

```powershell
npx supabase db reset --local
npx supabase db lint --local
```

If Docker is unavailable, record that the isolated GitHub CI database job remains the replay authority; do not connect to production.

- [ ] **Step 7: Commit the migration**

```powershell
git add supabase/migrations tests/migrations.test.ts
git commit -m "feat: add option tracker schema"
```

---

### Task 3: Map and persist nested options and option records

**Files:**
- Modify: `src/services/row-mappers.ts`
- Modify: `src/services/row-mappers.test.ts`
- Modify: `src/services/repository-types.ts`
- Modify: `src/services/supabase-repositories.ts`
- Modify: `src/services/supabase-repositories.test.ts`
- Modify: `src/runtime/application-runtime.ts`

**Interfaces:**
- Produces: `TrackerOptionRow`, `trackerFromRows(trackerRow, optionRows)`, option-aware `trackerToRow`, `optionToRow`, `logFromRow`, and `logToRow`.
- `TrackerRepository.list(): Promise<Tracker[]>` returns trackers with nested ordered options.
- `TrackerRepository.upsert(tracker: Tracker): Promise<void>` calls `save_tracker_with_options` for both Unit and Option variants.

- [ ] **Step 1: Write failing mapper tests for both variants**

Require Unit rows to map to `inputType: 'unit', options: []`, Option tracker rows plus option rows to map into ordered nested options, and option logs to map as:

```ts
expect(logFromRow({
  id: 'log-1', user_id: 'user-1', tracker_id: 'tracker-1', value: null,
  option_id: 'wake-id', occurred_at: NOW, note: null,
  source: 'website', client_id: 'log-1'
})).toEqual({
  id: 'log-1', trackerId: 'tracker-1', recordType: 'option',
  value: null, optionId: 'wake-id', occurredAt: NOW,
  note: '', source: 'website'
});
```

- [ ] **Step 2: Run mapper/repository tests and confirm failure**

```powershell
npm run test -- src/services/row-mappers.test.ts src/services/supabase-repositories.test.ts
```

Expected: FAIL on missing option row fields and RPC expectations.

- [ ] **Step 3: Implement exact row shapes and pure mappers**

Use nullable `unit`, `quick_values`, `value`, and `option_id` fields. Derive `recordType` from whether `option_id` is present and reject rows where value/option presence is not exclusive. Map each nested option with ID, label, sort order, and created timestamp. Serialize Unit trackers with `options_payload: []`; serialize Option trackers with their ordered options.

- [ ] **Step 4: Make tracker loading assemble nested options**

In `SupabaseTrackerRepository.list`, load owner-scoped `trackers` and `tracker_options` in parallel, order both, group options by `tracker_id`, and call `trackerFromRows`. A Unit tracker with options or an Option tracker without 1–8 options must surface as a safe repository validation error.

- [ ] **Step 5: Route tracker upserts through the atomic RPC**

```ts
const { error } = await this.client.rpc('save_tracker_with_options', {
  tracker_payload: withoutUserId(trackerToRow(tracker, this.userId)),
  options_payload: tracker.options.map(option => (
    withoutUserId(optionToRow(option, tracker.id, this.userId))
  ))
});
```

Retain owner-scoped table deletes for complete tracker deletion. Update backup serialization to pass options in the version-4 tracker payload expected by the restore RPC.

- [ ] **Step 6: Run tests and type checking**

```powershell
npm run test -- src/services/row-mappers.test.ts src/services/supabase-repositories.test.ts
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 7: Commit persistence adapters**

```powershell
git add src/services/row-mappers* src/services/repository-types.ts src/services/supabase-repositories* src/runtime/application-runtime.ts
git commit -m "feat: persist option tracker records"
```

---

### Task 4: Implement atomic option edits in TrackerService

**Files:**
- Modify: `src/services/sync-service.ts`
- Modify: `src/services/tracker-service.ts`
- Modify: `src/services/tracker-service.test.ts`
- Modify: `src/services/cloud-state-service.ts`
- Modify: `src/services/cloud-state-service.test.ts`

**Interfaces:**
- Produces: discriminated `UnitTrackerInput | OptionTrackerInput` as `TrackerInput`.
- Produces: `TrackerSaveImpact`, `TrackerAnalysisResult`, and `TrackerService.analyze(input)` so the controller can confirm before mutation.
- Consumes: `reconcileTrackerOptions` from Task 1 and atomic repository upsert from Task 3.

- [ ] **Step 1: Write failing service tests**

Cover creation with one/many options, rename retaining IDs, reorder, removal deleting matching local records, type change with no records, type-change rejection with records, rollback, and queued offline save. Assert replacement means rename, while a prior save that removes followed by a second save creates a new ID.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
npm run test -- src/services/tracker-service.test.ts src/services/cloud-state-service.test.ts
```

Expected: FAIL because `TrackerInput` and optimistic removal logic are still Unit-only.

- [ ] **Step 3: Define discriminated tracker inputs**

```ts
interface TrackerInputBase {
  id?: string;
  name: string;
  icon: string;
  color: string;
}

export type TrackerInput =
  | (TrackerInputBase & {
      inputType: 'unit'; unit: string; goal: number | null; presets: number[];
    })
  | (TrackerInputBase & {
      inputType: 'option'; optionLabels: string[];
    });
```

Add the exact synchronous analysis contract; do not start persistence and then ask for confirmation:

```ts
export interface TrackerSaveImpact {
  removedOptions: TrackerOption[];
  removedRecordCount: number;
}

export type TrackerAnalysisResult =
  | { ok: true; impact: TrackerSaveImpact }
  | { ok: false; error: ApplicationError };

export interface TrackerService {
  analyze(input: TrackerInput): TrackerAnalysisResult;
  save(input: TrackerInput): Promise<OperationResult>;
  toggle(id: string): Promise<OperationResult>;
  delete(id: string): Promise<OperationResult>;
}
```

- [ ] **Step 4: Implement validated save and local cascade**

For Option inputs, reconcile against existing options and create `unit: null`, `goal: null`, `presets: []`. For Unit inputs, produce `options: []`. Reject input-type changes when `before.logs.some(log => log.trackerId === id)`. On apply, replace/add the tracker and remove logs whose `optionId` belongs to removed options. On rollback, restore the full prior state.

- [ ] **Step 5: Replay queued tracker mutations consistently**

Update `cloud-state-service.ts` `applyOperation` so replaying an `upsertTracker` calculates removed option IDs from the pre-operation tracker and removes their option logs before overlaying the queued tracker. This keeps offline refresh consistent with the service's optimistic state.

- [ ] **Step 6: Run focused and full service tests**

```powershell
npm run test -- src/services/tracker-service.test.ts src/services/cloud-state-service.test.ts src/services/sync-service.test.ts src/services/offline-queue.test.ts
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 7: Commit tracker mutations**

```powershell
git add src/services/sync-service.ts src/services/tracker-service* src/services/cloud-state-service*
git commit -m "feat: manage tracker options atomically"
```

---

### Task 5: Add Option records to LogService and undo

**Files:**
- Modify: `src/services/sync-service.ts`
- Modify: `src/services/log-service.ts`
- Modify: `src/services/log-service.test.ts`

**Interfaces:**
- Produces: discriminated `LogInput = UnitLogInput | OptionLogInput`.
- Unit input requires `recordType: 'unit'` and `value`; Option input requires `recordType: 'option'` and `optionId`.
- `LogService.add`, `update`, `delete`, and undo operate on both variants without converting one into the other.

- [ ] **Step 1: Write failing Option log tests**

```ts
const result = await service.add({
  recordType: 'option', trackerId: 'sleep-tracker', optionId: 'wake-id',
  occurredAt: NOW, note: ''
});
expect(result.ok).toBe(true);
expect(store.getState().logs.at(-1)).toMatchObject({
  recordType: 'option', value: null, optionId: 'wake-id'
});
```

Also reject an option from another tracker, numeric input for an Option tracker, option input for a Unit tracker, a deleted option, and record-type changes during edit.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
npm run test -- src/services/log-service.test.ts
```

Expected: FAIL because `LogInput` requires numeric value.

- [ ] **Step 3: Implement discriminated LogInput and validation**

```ts
export type LogInput =
  | { recordType: 'unit'; trackerId: string; value: number; occurredAt: string; note: string }
  | { recordType: 'option'; trackerId: string; optionId: string; occurredAt: string; note: string };
```

Build complete domain records with the complementary field set to `null`. Validate tracker type and option ownership before optimistic mutation. Preserve the original `source` on edit.

- [ ] **Step 4: Verify add, edit, delete, rollback, and undo**

```powershell
npm run test -- src/services/log-service.test.ts src/services/sync-service.test.ts
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 5: Commit Option log services**

```powershell
git add src/services/sync-service.ts src/services/log-service*
git commit -m "feat: record timestamped tracker options"
```

---

### Task 6: Upgrade cloud loading, cache, queue, and backup/restore

**Files:**
- Modify: `src/services/cache.test.ts`
- Modify: `src/services/offline-queue.test.ts`
- Modify: `src/services/cloud-state-service.ts`
- Modify: `src/services/cloud-state-service.test.ts`
- Modify: `src/services/backup-service.ts`
- Modify: `src/services/backup-service.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: nested options from `TrackerRepository.list` and discriminated records from `LogRepository.listAll`.
- Produces: version-4 JSON/CSV export and version-3/version-4 import.
- Produces: queue replay ordering where option definitions are saved before records referencing new option IDs.

- [ ] **Step 1: Write failing compatibility and relationship tests**

Add tests for version-3 JSON import to Unit state, version-4 option export/import with remapped tracker/option/log IDs, rejection of orphan option IDs before repository calls, option CSV rows, cache round-trip, and offline queue round-trip.

Use these CSV headers:

```ts
const CSV_HEADERS = [
  'ID', 'Tracker', 'Record Type', 'Value', 'Unit', 'Option', 'Occurred At', 'Note'
] as const;
```

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
npm run test -- src/services/cache.test.ts src/services/offline-queue.test.ts src/services/cloud-state-service.test.ts src/services/backup-service.test.ts
```

Expected: FAIL on version 4, option relationships, and CSV output.

- [ ] **Step 3: Implement dual-version backup validation and ID remapping**

Keep a strict legacy version-3 schema using legacy Unit shapes and a strict version-4 schema using current schemas. Normalize either into version 4 before mutation. During import, create a tracker ID map and an option ID map; remap each Option record through both maps. Validate every option belongs to its tracker before the first destructive RPC.

- [ ] **Step 4: Make export, sample/reset, and relationship checks type-aware**

JSON export emits version 4. CSV puts numeric value/unit only on Unit rows and option label only on Option rows. Sample data remains Unit-only and skips Option trackers. Reset continues restoring the exact two default Unit trackers. Clear logs removes both variants. `relationshipsAreValid` verifies unique tracker/log/option IDs and option ownership.

- [ ] **Step 5: Wire operation execution and cloud startup**

In `main.ts`, keep `upsertTracker` routed to the now-atomic repository, route both log variants through the same log repository, and ensure sync drains tracker option operations before dependent log operations by preserving queue order. Cloud load validates the assembled version-4 state before store replacement.

- [ ] **Step 6: Run service regression tests**

```powershell
npm run test -- src/services
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 7: Commit state compatibility and backup support**

```powershell
git add src/services src/main.ts
git commit -m "feat: sync and back up option trackers"
```

---

### Task 7: Add Unit/Option controls to the tracker modal

**Files:**
- Modify: `index.html`
- Modify: `src/features/trackers/index.ts`
- Modify: `src/features/trackers/index.test.ts`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: `TrackerService.analyze` and `save`, discriminated `TrackerInput`, `parseOptionLabels`.
- Produces DOM IDs: `trackerInputType`, `trackerUnitFields`, `trackerOptionFields`, and `trackerOptions`.

- [ ] **Step 1: Write failing controller tests**

Test that a new modal defaults to Unit; selecting Option hides Unit/goal/quick-value fields and shows an empty Options field; editing an Option tracker populates comma labels; type is disabled when records exist; duplicate/ninth option leaves modal open; confirmed removal calls save; cancelled removal does not mutate.

- [ ] **Step 2: Run the controller test and confirm failure**

```powershell
npm run test -- src/features/trackers/index.test.ts
```

Expected: FAIL because the new controls do not exist.

- [ ] **Step 3: Add accessible conditional form markup**

Inside `#trackerForm`, add:

```html
<div class="field">
  <label for="trackerInputType">Tracking type</label>
  <select id="trackerInputType" class="select" required>
    <option value="unit">Unit</option>
    <option value="option">Option</option>
  </select>
  <p id="trackerInputTypeHelp" class="field-help"></p>
</div>
<div id="trackerUnitFields">
  <div class="field">
    <label for="trackerUnit">Unit</label>
    <input id="trackerUnit" class="input" maxlength="30" placeholder="minute, count, ml" />
  </div>
  <div class="field">
    <label for="trackerGoal">Daily goal (optional)</label>
    <input id="trackerGoal" class="input" type="number" min="0" step="any" placeholder="30" />
  </div>
  <div class="field">
    <label for="trackerPresets">Quick values, separated by commas</label>
    <input id="trackerPresets" class="input" placeholder="5, 10, 15" />
  </div>
</div>
<div id="trackerOptionFields" hidden>
  <div class="field">
    <label for="trackerOptions">Options, separated by commas</label>
    <input id="trackerOptions" class="input" placeholder="Sleep, Wake" />
  </div>
</div>
```

Move the existing Unit, Daily goal, and Quick values controls into `trackerUnitFields` without changing their IDs or labels.

- [ ] **Step 4: Implement type-aware modal state and submission**

Preserve temporary Unit and Option values when switching the dropdown during one open modal. Build the correct discriminated input. Call `analyze` before `save`; when removals have records, confirm with ``Remove ${labels} and delete ${count} associated records?``. Disable type and show `Tracking type cannot change after records exist.` when applicable.

- [ ] **Step 5: Render management copy for both types**

Unit cards keep `unit · records · Quick values`. Option cards show `Option · records · Options: Sleep, Wake`, escaping every label. Reuse current buttons and actions.

- [ ] **Step 6: Run feature tests and accessibility-sensitive checks**

```powershell
npm run test -- src/features/trackers/index.test.ts src/styles/app.test.ts
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 7: Commit the tracker form**

```powershell
git add index.html src/features/trackers src/styles/app.css
git commit -m "feat: configure option trackers"
```

---

### Task 8: Make the record modal and quick logging type-aware

**Files:**
- Modify: `index.html`
- Modify: `src/features/logs/index.ts`
- Modify: `src/features/logs/index.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces: `LogController.addQuickLog(trackerId, value)` for Unit and `addQuickOptionLog(trackerId, optionId)` for Option.
- Manual modal toggles `logValueField` and `logOptionField` based on selected tracker.

- [ ] **Step 1: Write failing log-controller tests**

Cover tracker dropdown labels, type-aware fields, manual option add/edit, current timestamp option quick click, escaped option labels, undo recreation with the original record variant, and rejection when a selected option no longer exists.

- [ ] **Step 2: Run the focused test and confirm failure**

```powershell
npm run test -- src/features/logs/index.test.ts
```

Expected: FAIL on missing Option field and controller method.

- [ ] **Step 3: Add the Option field without replacing existing IDs**

Wrap current Value markup in `#logValueField` and add:

```html
<div id="logOptionField" class="field" hidden>
  <label for="logOption">Option</label>
  <select id="logOption" class="select"></select>
</div>
```

- [ ] **Step 4: Implement type-aware rendering and submission**

On tracker change, Unit shows Value and sets the first preset; Option shows Option and renders its ordered labels. On edit, derive the field from `recordType`. Submit the exact discriminated `LogInput`. Keep date/time, note, close, toast, and undo behaviour shared.

Add:

```ts
addQuickOptionLog(trackerId: string, optionId: string): Promise<void>;
```

It validates ownership, records `new Date().toISOString()`, and shows `<tracker>: <option> recorded` through the existing queued/undo toast flow.

- [ ] **Step 5: Run log controller and service tests**

```powershell
npm run test -- src/features/logs/index.test.ts src/services/log-service.test.ts
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 6: Commit type-aware record entry**

```powershell
git add index.html src/features/logs src/main.ts
git commit -m "feat: add option record entry"
```

---

### Task 9: Render Option trackers on Dashboard and History

**Files:**
- Modify: `src/features/dashboard/index.ts`
- Modify: `src/features/dashboard/index.test.ts`
- Modify: `src/features/history/index.ts`
- Modify: `src/features/history/index.test.ts`
- Modify: `src/main.ts`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: both quick-log methods from Task 8.
- Produces: count-based daily totals for Option trackers and numeric totals for Unit trackers.

- [ ] **Step 1: Write failing Dashboard and History tests**

Dashboard expectations:

```ts
expect(grid.innerHTML).toContain('data-quick-option="sleep-tracker"');
expect(grid.innerHTML).toContain('data-option-id="wake-id"');
expect(grid.textContent).toContain('2 records today');
expect(grid.innerHTML).not.toContain('progress-fill');
```

History expectations: Unit rows show `+1 cigarette`; Option rows show the resolved current label `Wake` and no `+null`; record count includes both; numeric summaries exclude Option rows.

- [ ] **Step 2: Run feature tests and confirm failure**

```powershell
npm run test -- src/features/dashboard/index.test.ts src/features/history/index.test.ts
```

Expected: FAIL because renderers assume every record is numeric.

- [ ] **Step 3: Add shared type-aware presentation helpers**

Add focused pure helpers in the relevant feature modules:

```ts
function optionForLog(state: Readonly<AppState>, log: OptionTrackingLog): TrackerOption | undefined;
function dailyMetric(state: Readonly<AppState>, tracker: Tracker, dateKey: string): number;
```

For Unit trackers, `dailyMetric` sums values; for Option trackers, it counts records. Ignore invalid relationships defensively rather than injecting unescaped fallback data.

- [ ] **Step 4: Reuse the existing card with Option mappings**

Render Option labels as the current quick-action buttons with `data-quick-option` and `data-option-id`. Show today's record count and latest option/time. Omit goal copy and progress only for Option trackers. The seven-day chart uses counts when the selected tracker is Option.

- [ ] **Step 5: Render History and summaries without mixed-unit arithmetic**

Resolve option labels from the owning tracker's current options. Keep existing filters, grouping, notes, edit/delete buttons, dates, escaping, and icons. Record counts include both; only Unit records contribute to numeric totals. Replace the global `combined value` chip with a neutral record-count caption when filtered results contain incompatible units or Option records.

- [ ] **Step 6: Wire Option clicks through `main.ts`**

Extend `DashboardControllerDependencies` with `addQuickOptionLog` and pass through `logController.addQuickOptionLog`. Preserve the current Unit callback unchanged.

- [ ] **Step 7: Run all feature tests**

```powershell
npm run test -- src/features
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 8: Commit Dashboard and History**

```powershell
git add src/features/dashboard src/features/history src/main.ts src/styles/app.css
git commit -m "feat: display option tracking activity"
```

---

### Task 10: Add deterministic browser fixtures and end-to-end acceptance flows

**Files:**
- Modify: `src/testing/browser-fixture.ts`
- Modify: `src/testing/browser-fixture.test.ts`
- Modify: `tests/e2e/tracker-crud.spec.ts`
- Modify: `tests/e2e/offline-sync.spec.ts`
- Modify: `tests/e2e/responsive-theme.spec.ts`

**Interfaces:**
- Produces: a deterministic `Sleep Tracker` with stable `sleep-option` and `wake-option` IDs in fixture repositories.
- Proves: create, quick log, manual edit, rename, reorder, confirmed cascade, locked type, offline recovery, and responsive usability.

- [ ] **Step 1: Add a failing fixture contract test**

Require the in-memory tracker repository to store nested options through `upsert`, the in-memory log repository to cascade records when an omitted option is saved, and the populated fixture to expose a valid Option tracker.

- [ ] **Step 2: Run the fixture test and confirm failure**

```powershell
npm run test -- src/testing/browser-fixture.test.ts
```

Expected: FAIL because the fixture repository is Unit-only.

- [ ] **Step 3: Implement deterministic Option fixture behaviour**

Use fixed IDs and timestamps:

```ts
{
  id: 'tracker-sleep', inputType: 'option', name: 'Sleep Tracker',
  unit: null, goal: null, presets: [], icon: '🌙', color: '#6d4aff',
  options: [
    { id: 'option-sleep', label: 'Sleep', sortOrder: 0, createdAt: FIXTURE_NOW },
    { id: 'option-wake', label: 'Wake', sortOrder: 1, createdAt: FIXTURE_NOW }
  ],
  active: true, sortOrder: 2, createdAt: FIXTURE_NOW
}
```

The fixture executor must use the same local cascade semantics as production operation replay.

- [ ] **Step 4: Add Playwright Option workflows**

In `tracker-crud.spec.ts`, add separate tests for:

1. Create `Sleep, Wake`, quick-log Wake, manually edit its timestamp/note, and verify timestamped History plus the locked Tracking type.
2. Rename Wake to Awake, reorder Awake/Sleep, remove Awake with confirmation, and verify the existing row first follows the rename and then disappears.

Use accessible labels and stable data IDs; do not depend on animation timing.

- [ ] **Step 5: Add offline and responsive coverage**

Add one `offline-sync.spec.ts` flow that clicks an Option while offline, reloads, verifies it remains, reconnects, and verifies the pending count drains. Keep label limits, duplicates, reorder identity, and type-lock edge cases in unit/controller tests. Add only one mobile assertion that Option buttons and conditional modal fields have no horizontal overflow; retain the existing theme coverage rather than duplicating it.

- [ ] **Step 6: Run unit and browser acceptance tests**

```powershell
npm run test -- src/testing/browser-fixture.test.ts
npm run test:e2e
```

Expected: all configured desktop/mobile projects pass with no production Supabase calls.

- [ ] **Step 7: Commit browser acceptance coverage**

```powershell
git add src/testing tests/e2e
git commit -m "test: cover option tracker workflows"
```

---

### Task 11: Run the release-quality verification gate and document the feature

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md` only if the repository's current release workflow expects unreleased entries; do not run a release command.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: a verified, documented feature ready for code review; does not deploy, push, tag, or change production data.

- [ ] **Step 1: Update concise user/developer documentation**

In `README.md`, describe Unit and Option trackers, the 1–8 label rule, immediate timestamp logging, destructive option removal, and version-3 backup compatibility. Keep database deployment instructions migration-based and explicitly prohibit `db reset --linked`.

- [ ] **Step 2: Run formatting and secret-scope checks**

```powershell
git diff --check
git status --short
git diff -- . ':!package-lock.json' | Select-String -Pattern 'service_role|SUPABASE_SERVICE|password\s*=|access_token' -CaseSensitive:$false
```

Expected: `git diff --check` exits 0; no secret-bearing additions are found. Inspect every reported match rather than assuming it is safe.

- [ ] **Step 3: Run the complete application gate**

```powershell
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
git diff --check
```

Expected: every command exits 0, Vitest and Playwright report zero failures, and Vite produces `dist/` without staging it.

- [ ] **Step 4: Run database verification at the available authority level**

Preferred local Docker-backed verification:

```powershell
npx supabase db reset --local
npx supabase db lint --local
```

Expected: the full migration chain replays and lint returns no errors. If Docker is unavailable, do not weaken or bypass the migration tests and do not use a linked production database; record that CI database replay is still required.

- [ ] **Step 5: Perform safe manual checks**

Use deterministic fixtures for destructive flows. Manually verify Unit regression, one-option and multi-option creation, quick and manual Option logs, rename/reorder/removal confirmation, input-type lock, offline refresh/reconnect, JSON/CSV export, mobile width, light/dark themes, and keyboard focus. Production Supabase verification is read-only or uses a backup/test account; do not clear, reset, import, or load sample data into real user data.

- [ ] **Step 6: Commit documentation and any verification-only corrections**

```powershell
git add README.md CHANGELOG.md src tests supabase
git commit -m "docs: document option trackers"
```

If `CHANGELOG.md` was intentionally unchanged, omit it from `git add`. Do not create an empty commit.

- [ ] **Step 7: Request code review before integration**

Invoke `superpowers:requesting-code-review`, review the complete diff against `docs/superpowers/specs/2026-07-21-option-trackers-design.md`, and resolve findings before using `superpowers:finishing-a-development-branch`. Do not push or merge without Vincent's direction.

---

## Definition of Done

- Every task's focused red/green cycle is evidenced in command output.
- All acceptance criteria in the approved design spec map to a passing automated test or an explicit safe manual check.
- Existing version-3 cache/backup and Unit tracker behaviour remain compatible.
- The new migration is additive, owner-scoped, replayable, linted, and represented only under `supabase/migrations/`.
- The full application verification gate passes with zero failures.
- No secrets, generated `dist/`, production mutations, deploys, tags, pushes, or merges are included.
