# Option Trackers Design

Date: 2026-07-21
Status: Approved design
Target branch: `dev`

## Goal

Extend the existing generic tracker so a tracker can record either numeric units or named options.
An option tracker provides the same one-click recording, manual editing, history, offline sync, and
cloud persistence as the current unit tracker. It is not a timer or a separate product area.

Examples:

- `Smoking` remains a unit tracker with unit `cigarette` and quick value `1`.
- `Sleep Tracker` can be an option tracker with options `Sleep, Wake`.
- `Work Tracker` can be an option tracker with options `Start work, Off work`.
- An option tracker may have one option, such as `Eat`.

## Non-goals

- Do not add check-in state, running timers, paired sessions, or duration calculations.
- Do not create a separate navigation destination for option trackers.
- Do not add goals or progress calculations to option trackers.
- Do not redesign the existing application shell or tracker card system.
- Do not convert existing unit trackers or records automatically.

## Product model

Every tracker has an input type:

- `unit`: the current numeric unit, quick values, optional daily goal, and numeric records.
- `option`: one to eight named actions and timestamped option records.

New trackers default to `unit`. Existing trackers normalize to `unit` without user action. A tracker
may change input type only while it has no records. Once any record exists, its input type is locked;
all other tracker settings remain editable.

Option labels are entered in one comma-separated field. The application trims surrounding
whitespace, ignores empty comma entries, and requires one to eight unique labels of 1 to 80
characters each. Uniqueness is case-insensitive, so `Sleep` and `sleep` cannot coexist in one
tracker.

## Option identity and lifecycle

Each visible option has an internal stable ID that is not exposed in the interface. Records reference
the option ID rather than copying its label. This gives the approved lifecycle behaviour:

- Renaming an option changes the label shown by its existing records.
- Reordering options changes button order without changing record ownership.
- Removing an option permanently deletes all records associated with that option.

The comma-separated editor must reconcile submitted labels with existing option IDs
deterministically. It first preserves IDs for case-insensitively matching labels that still exist,
regardless of order. Remaining submitted labels reuse remaining existing IDs in order as renames.
Surplus labels receive new IDs; surplus existing IDs are removals. Therefore, replacing a label in a
single save is a rename. To remove an option and add an unrelated new option instead, the user must
save the removal first and add the new label in a second edit. The edit form warns before saving any
removal and reports how many associated records will be deleted. The tracker and option changes,
including cascaded record deletions, are persisted atomically.

## Domain model

The application models trackers and records as typed variants while retaining common fields such as
ID, name, icon, colour, active state, ordering, timestamps, tracker ownership, and notes.

A unit tracker contains:

- `inputType: 'unit'`
- a non-empty unit
- one to eight positive numeric quick values
- an optional non-negative daily goal
- no options

An option tracker contains:

- `inputType: 'option'`
- one to eight ordered options with stable IDs and labels
- no numeric unit, quick values, or daily goal

A unit record contains a positive numeric value and no option reference. An option record contains an
option reference and no numeric value. Both record types contain a tracker ID, occurrence timestamp,
optional note, source, and record ID.

The application state and backup format move from version 3 to version 4. State normalization and
backup import continue accepting version 3 data by treating all version 3 trackers and records as
unit variants.

## Database design

Add a versioned Supabase migration with these changes:

1. Add an `input_type` column to `trackers`, defaulting existing rows to `unit`, with a check that
   permits only `unit` or `option`.
2. Make unit-only tracker fields compatible with option trackers while enforcing the correct fields
   for each input type.
3. Create `tracker_options` with option ID, user ID, tracker ID, label, sort order, and timestamps.
4. Enforce option ownership, the 1-to-80-character label length, case-insensitive label uniqueness per
   tracker, and a maximum of eight options per tracker.
5. Extend `tracking_logs` so exactly one of numeric value or option reference is present.
6. Use a composite relationship between tracker and option so an option record cannot reference an
   option belonging to another tracker.
7. Cascade option deletion to associated tracking records.
8. Add RLS policies and indexes consistent with the existing user-scoped tracker and record access.
9. Prevent changing a tracker's input type after records exist.
10. Add or replace an authenticated, invoker-rights RPC that saves tracker and option changes in one
    transaction, including option removals.
11. Extend the atomic backup restore contract to restore options and option records safely.

Existing unit data must remain valid throughout the migration. No production data is rewritten as
option data, and no secrets or elevated frontend credentials are introduced.

## Tracker form

Add a `Tracking type` dropdown to the existing create/edit tracker modal.

For `Unit`, show the current fields:

- Unit
- Daily goal
- Quick values, separated by commas

For `Option`, hide those fields and show:

- Options, separated by commas

The option field starts empty for a new tracker and may use a placeholder such as `Sleep, Wake`.
Changing the dropdown while creating a tracker switches the visible fields without losing values
already entered during that modal session. When editing a tracker that has records, the dropdown is
disabled and explains why.

Saving an option tracker validates the parsed labels before mutation. Missing, duplicate, excessive,
or overlong parsed input produces a specific toast and leaves the modal open. If saving removes
options with records, ask for confirmation before sending the mutation. Cancelling keeps the tracker
unchanged.

## Dashboard behaviour

Option trackers use the existing tracker card layout and styling. They do not receive a separate card
component or page.

The card maps existing unit behaviour to option behaviour as follows:

- Numeric quick-value buttons become option-label buttons.
- Clicking a button immediately creates a record for that option at the current time.
- The card reports today's option-record count rather than a combined numeric value.
- Latest activity identifies the latest option and its relative time.
- Goal copy and the progress bar are omitted because option trackers have no daily goal.
- Icon, colour, edit action, active state, responsive layout, and empty states retain current behaviour.

An option click follows the same optimistic persistence path as a numeric quick log. The record renders
immediately. Success shows a toast such as `Sleep Tracker: Wake recorded`; an offline success includes
the existing offline wording.

The seven-day chart continues using the selected tracker. Unit trackers chart numeric totals. Option
trackers chart the number of option records per day.

## Manual records and history

The existing record modal adapts to the selected tracker's input type:

- Unit tracker: show the current numeric Value field.
- Option tracker: replace Value with an Option dropdown containing the tracker's current options.

Both variants retain Tracker, Date and time, Note, Save, edit, and delete behaviour. Manual option
records use the selected timestamp rather than the current time. A tracker with no valid options cannot
accept an option record.

History uses the existing filters, date grouping, row actions, and responsive layout. Unit records keep
the current `+value unit` presentation. Option records show their current option label without a plus
sign or numeric value. Because option records reference option IDs, renaming an option changes its label
wherever its records render. Removing the option deletes those rows through the approved cascade.

Aggregate captions must not add option records to numeric values. Record counts include both variants;
numeric totals include unit records only. Wherever units differ, the UI must not imply that unrelated
unit values form a meaningful combined measurement.

## Persistence and offline flow

Option records use the existing optimistic service and offline-operation flow:

1. Validate that the tracker is an option tracker and the option belongs to it.
2. Create an option record and an upsert operation with stable IDs.
3. Update the store, local cache, and UI optimistically.
4. Persist immediately when online or enqueue when offline.
5. Retain queued work across refresh and drain it in order after reconnecting.
6. Roll back validation, permission, or other permanent persistence failures.

Tracker option mutations use one operation containing the complete intended tracker and ordered option
set. Local state applies rename, reorder, addition, removal, and associated record deletion together.
The cloud executor calls the transactional RPC so it cannot leave partially updated options or records.
Queued option mutations replay before later records that depend on newly created options.

Cloud loading retrieves trackers, options, records, and settings, validates their relationships, and
commits one normalized state. An invalid option relationship is rejected at the trust boundary rather
than rendered as a different tracker's data.

Backup export includes options and option references. Version 4 import validates option ownership and
relationships before destructive work. Version 3 imports create unit-only state. Reset and clear flows
must include option data through existing tracker and log cascades.

## Error handling

- Invalid option input keeps the form open and shows an actionable message.
- A stale or foreign option reference is a validation failure.
- A click repeated while the first mutation is pending follows the same behaviour as current quick
  logging and creates a separate timestamped record.
- Network failures retain optimistic data and queue the operation.
- Permanent failures roll back to the pre-operation state and show a safe message.
- Option removal always requires confirmation when associated records exist and states the destructive
  consequence.
- Transactional database failures leave the prior tracker, options, and records intact.

## Codebase placement

- `src/domain/`: tracker/record variants, option model, schemas, state normalization, and offline
  operations.
- `src/state/`: store each option tracker's ordered options inside that tracker and store option
  records within version 4 state; no independent top-level option store is required.
- `src/services/`: repository interfaces, row mappings, Supabase repositories/RPC calls, tracker and
  record services, cache, queue, sync, cloud loading, and backup/restore.
- `src/features/trackers/`: tracking-type selection, conditional fields, comma parsing, validation, and
  destructive option-removal confirmation.
- `src/features/dashboard/`: option buttons, counts, latest option, and count-based chart values.
- `src/features/logs/`: type-aware manual add/edit form and option quick logging.
- `src/features/history/`: type-aware record rows, summaries, filtering, edit, and delete.
- `src/runtime/` and `src/testing/`: compose production repositories and deterministic option fixtures.
- `index.html` and `src/styles/`: conditional form controls and small state-aware styling within the
  existing design system.
- `supabase/migrations/`: additive schema, constraints, RLS, indexes, transactional mutation, and restore
  updates.

## Testing strategy

Unit and integration tests cover:

- Unit and option schema validation and version 3 normalization.
- Comma parsing, whitespace trimming, empty entries, case-insensitive duplicates, and the one-to-eight
  limit.
- Stable option identity across rename and reorder.
- Cascading record removal and destructive confirmation.
- Tracker-type locking after the first record.
- Unit and option row mappings and repository requests.
- Optimistic option logging, rollback, queue persistence, replay ordering, and refresh recovery.
- Cloud loading and invalid option relationships.
- Version 3 and version 4 backup import, export, reset, and atomic restore.
- Tracker, dashboard, log, and history controller rendering and interactions.
- Migration contracts for type constraints, composite relationships, RLS, cascades, and RPC safety.

Playwright covers:

- Creating a one-option tracker and a multi-option tracker.
- Immediate option logging and timestamped History display.
- Manual option record creation and editing.
- Option rename updating existing History labels.
- Reordering buttons without losing record ownership.
- Confirmed option removal deleting associated records.
- Type locking after a record exists.
- Offline option logging, refresh recovery, and reconnect synchronization.
- Desktop and mobile layouts for option fields, cards, buttons, modals, and history rows.

Required verification remains:

```text
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
git diff --check
```

## Acceptance criteria

- Users can choose Unit or Option when creating a tracker.
- Existing Unit behaviour and data remain unchanged.
- Option trackers accept one to eight comma-separated labels and reuse the current tracker UI.
- Clicking an option records the selected option and current timestamp immediately.
- Manual option records support option selection, date/time, notes, editing, and deletion.
- Renaming an option updates the label displayed by associated records.
- Reordering options preserves record ownership.
- Removing an option, after confirmation, deletes its associated records atomically.
- Option trackers have no unit, daily goal, progress bar, session state, or duration calculation.
- Option records work online, offline, across refresh, in backup/restore, and under existing RLS rules.
- Automated checks pass and production Unit data remains valid.
