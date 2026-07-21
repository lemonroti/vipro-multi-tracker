# Part 3 — Mobile UI and Android Widget

## Task 10: Build the mobile application shell

**Files:**
- Create: `apps/flutter/lib/shared/app_scaffold.dart`
- Create: `apps/flutter/lib/home/home_screen.dart`
- Create: `apps/flutter/lib/history/history_screen.dart`
- Create: `apps/flutter/lib/trackers/tracker_editor_screen.dart`
- Create: `apps/flutter/lib/logs/log_editor_sheet.dart`
- Create: `apps/flutter/lib/settings/settings_screen.dart`
- Modify: `apps/flutter/lib/app/app_router.dart`
- Test: `apps/flutter/test/widget/screens_test.dart`

**Produces:** bottom-navigation Android UI with Home, History, Trackers, and Settings.

- [ ] Write widget tests for navigation, loading/empty/error states, light/dark themes, pending-sync badge, tracker creation, quick record, manual record, history edit/delete, and sign-out.

- [ ] Implement `AppScaffold` with `NavigationBar` destinations:

```text
Home
History
Trackers
Settings
```

Use `StatefulShellRoute.indexedStack` so tab state is preserved.

- [ ] Home screen requirements:
  - active trackers only;
  - tracker icon, name, today's total, optional goal progress;
  - one button for each preset;
  - custom-value action;
  - pending-sync indicator on locally pending records;
  - no chart in MVP.

- [ ] History requirements:
  - newest-first records;
  - date and tracker filters;
  - record value, unit, time, note, and sync state;
  - edit and delete actions;
  - confirmation follows `confirmDelete` setting.

- [ ] Tracker screen requirements:
  - list active/inactive trackers;
  - create/edit fields: name, icon, unit, goal, presets, color, active state;
  - delete tracker with explicit warning that its logs are also removed by the existing foreign-key behavior.

- [ ] Settings requirements:
  - system/light/dark theme;
  - confirm-before-delete toggle;
  - authenticated email;
  - connection status, pending operation count, last sync result;
  - manual Sync now;
  - sign out.

- [ ] Verify:

```bash
flutter test test/widget/screens_test.dart
flutter analyze
```

- [ ] Commit:

```bash
git add apps/flutter/lib/home apps/flutter/lib/history apps/flutter/lib/trackers apps/flutter/lib/logs apps/flutter/lib/settings apps/flutter/lib/shared apps/flutter/lib/app/app_router.dart apps/flutter/test/widget
git commit -m "feat(flutter): add mobile tracker interface"
```

## Task 11: Add configurable widget persistence

**Files:**
- Create: `apps/flutter/lib/widget/widget_models.dart`
- Create: `apps/flutter/lib/widget/widget_service.dart`
- Create: `apps/flutter/lib/widget/widget_configuration_entry.dart`
- Create: `apps/flutter/lib/widget/widget_configuration_screen.dart`
- Test: `apps/flutter/test/widget/widget_service_test.dart`

**Produces:** per-widget configuration keyed by Android `appWidgetId`.

- [ ] Write failing tests proving each widget instance stores an independent tracker/value/title configuration and invalid tracker IDs are rejected.

- [ ] Define:

```dart
class TrackerWidgetConfiguration {
  const TrackerWidgetConfiguration({
    required this.appWidgetId,
    required this.userId,
    required this.trackerId,
    required this.title,
    required this.value,
    required this.unit,
    required this.icon,
    required this.updatedAt,
  });
}
```

- [ ] Implement `WidgetService.saveConfiguration`, `loadConfiguration`, `deleteConfiguration`, and `refreshWidget` using Drift plus `HomeWidget.updateWidget`.

- [ ] Implement configuration UI launched with Android widget ID. It must require an authenticated persisted session, show active trackers, allow one positive quick value and optional title, save configuration, update widget, and return `Activity.RESULT_OK`.

- [ ] Verify:

```bash
flutter test test/widget/widget_service_test.dart
```

- [ ] Commit:

```bash
git add apps/flutter/lib/widget apps/flutter/test/widget/widget_service_test.dart
git commit -m "feat(flutter): add widget configuration"
```

## Task 12: Implement Android AppWidget and offline tap handling

**Files:**
- Create: `apps/flutter/android/app/src/main/kotlin/com/lemonroti/multitracker/TrackerWidgetProvider.kt`
- Create: `apps/flutter/android/app/src/main/kotlin/com/lemonroti/multitracker/WidgetConfigurationActivity.kt`
- Modify: `apps/flutter/android/app/src/main/AndroidManifest.xml`
- Create: `apps/flutter/android/app/src/main/res/layout/tracker_widget.xml`
- Create: `apps/flutter/android/app/src/main/res/xml/tracker_widget_info.xml`
- Create: `apps/flutter/android/app/src/main/res/drawable/widget_background.xml`
- Modify: `apps/flutter/android/app/src/main/res/values/strings.xml`
- Create: `apps/flutter/lib/widget/widget_background.dart`
- Test: `apps/flutter/test/widget/widget_background_test.dart`

**Produces:** configurable single-action widget that creates a local pending log without opening the app.

- [ ] Write tests for background handler states:
  - configured + signed in + tracker exists → local log and pending upsert created;
  - offline → same successful local result;
  - signed out → no log and action-required result;
  - deleted tracker → no log and reconfigure result;
  - repeated taps → unique log UUIDs.

- [ ] Register Flutter callback at app startup:

```dart
await HomeWidget.registerInteractivityCallback(widgetBackgroundCallback);
```

- [ ] Implement top-level entry point:

```dart
@pragma('vm:entry-point')
Future<void> widgetBackgroundCallback(Uri? uri) async {
  WidgetsFlutterBinding.ensureInitialized();
  if (uri == null || uri.host != 'record') return;
  final appWidgetId = int.tryParse(uri.queryParameters['id'] ?? '');
  if (appWidgetId == null) return;
  await runWidgetRecord(appWidgetId);
}
```

`runWidgetRecord` loads persisted Supabase session and widget configuration, verifies tracker/user ownership, calls `LogService.addLog(..., source: 'android-widget')`, updates feedback to `Recorded +<value> <unit>`, and attempts opportunistic sync without delaying local success.

- [ ] Native widget layout displays icon, title, value/unit, and status. The root/button pending intent uses a unique URI:

```text
vipromultitracker://record?id=<appWidgetId>
```

- [ ] Manifest registration must include widget receiver metadata and configuration activity. The widget must not request notification permission.

- [ ] Verify Android resources and tests:

```bash
flutter test test/widget/widget_background_test.dart
flutter build apk --debug \
  --dart-define=SUPABASE_URL=https://example.supabase.co \
  --dart-define=SUPABASE_PUBLISHABLE_KEY=sb_publishable_example
```

Expected: APK builds and Android manifest merger succeeds.

- [ ] Commit:

```bash
git add apps/flutter/android apps/flutter/lib/widget apps/flutter/test/widget/widget_background_test.dart
git commit -m "feat(flutter): add offline Android tracker widget"
```
