# Flutter Android MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Android-first Flutter client under `apps/flutter/` that reuses the existing Supabase backend, records locally before syncing, and ships a configurable one-tap Android home-screen widget plus a downloadable debug APK.

**Architecture:** The Flutter app is local-first. App and widget actions write entities and pending operations atomically to Drift, update the UI immediately, then a sync engine drains queued operations to Supabase and reconciles cloud state back into Drift. The existing TypeScript web application and `main` branch remain unchanged.

**Tech Stack:** Flutter stable, Dart 3.10+, Riverpod, go_router, supabase_flutter, Drift, connectivity_plus, home_widget, workmanager, GitHub Actions.

## Global Constraints

- Work only on `flutter-android-mvp`; never commit, merge, or force-push to `main`.
- Keep the existing web application available and place Flutter under `apps/flutter/`.
- Android application ID: `com.lemonroti.multitracker`.
- Android minimum SDK: 24.
- Android-only first release; no Flutter Web or iOS build work.
- Existing Supabase Auth, tables, RLS, users, and data are reused.
- Supabase URL and publishable key are supplied by `--dart-define`; no secret/service-role credentials are committed.
- Every tracker/log mutation must write its pending operation in the same Drift transaction.
- Client UUIDs are generated before local insertion and reused for Supabase upserts.
- Widget recording works offline and does not open the full app.
- Notifications, charts, import/export, sample/reset tools, Play Store signing, and multi-action widgets are excluded.
- Completion requires formatting, static analysis, tests, debug APK build, and a GitHub Actions APK artifact.

## Plan Documents

1. [`2026-07-21-flutter-android-mvp-01-foundation.md`](2026-07-21-flutter-android-mvp-01-foundation.md)
   - Scaffold Flutter under `apps/flutter/`
   - Configure dependencies, package ID, and environment configuration
   - Define domain models, validation, navigation, and Auth

2. [`2026-07-21-flutter-android-mvp-02-local-data-sync.md`](2026-07-21-flutter-android-mvp-02-local-data-sync.md)
   - Build Drift schema and repositories
   - Implement atomic local writes and pending-operation compaction
   - Add Supabase adapters, synchronization, reconciliation, and account isolation

3. [`2026-07-21-flutter-android-mvp-03-ui-widget.md`](2026-07-21-flutter-android-mvp-03-ui-widget.md)
   - Build Home, History, Trackers, Settings, and editor flows
   - Add theme and pending-sync status
   - Implement configurable Android widget and offline one-tap recording

4. [`2026-07-21-flutter-android-mvp-04-verification-delivery.md`](2026-07-21-flutter-android-mvp-04-verification-delivery.md)
   - Add unit/widget/integration tests
   - Add branch-only GitHub Actions verification and APK artifact build
   - Run production verification without touching `main`

## Dependency Order

```text
Foundation
  → Local database and repositories
  → Supabase synchronization
  → Mobile feature UI
  → Android widget
  → Integration verification and APK delivery
```

## Delivery Definition

The plan is complete when the `flutter-android-mvp` branch contains a tested Flutter Android application, the current production Supabase account can sign in, cloud trackers/logs load, offline writes later synchronize, a configured widget records with one tap while offline, and GitHub Actions exposes `app-debug.apk` as a downloadable artifact.
