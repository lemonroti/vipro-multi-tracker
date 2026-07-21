# Part 1 — Flutter Foundation

## Task 1: Scaffold the Android Flutter project

**Files:**
- Create: `apps/flutter/**`
- Modify: `.gitignore`

**Produces:** Android-only Flutter project with application ID `com.lemonroti.multitracker`.

- [ ] Verify isolation:

```bash
git branch --show-current
git status --short
```

Expected branch: `flutter-android-mvp`.

- [ ] Scaffold:

```bash
flutter create --platforms=android --org com.lemonroti --project-name vipro_multi_tracker apps/flutter
```

- [ ] Change generated Android `namespace` and `applicationId` to:

```text
com.lemonroti.multitracker
```

Move `MainActivity.kt` to:

```text
apps/flutter/android/app/src/main/kotlin/com/lemonroti/multitracker/MainActivity.kt
```

- [ ] Set Android `minSdk` to 24.

- [ ] Replace dependencies in `apps/flutter/pubspec.yaml`:

```yaml
environment:
  sdk: ">=3.10.0 <4.0.0"

dependencies:
  flutter:
    sdk: flutter
  connectivity_plus: ^7.0.0
  drift: ^2.34.0
  drift_flutter: ^0.3.0
  flutter_riverpod: ^3.0.0
  go_router: ^17.0.0
  home_widget: ^0.9.0
  intl: ^0.20.0
  shared_preferences: ^2.5.0
  supabase_flutter: ^2.16.0
  uuid: ^4.5.0
  workmanager: ^0.9.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  integration_test:
    sdk: flutter
  build_runner: ^2.10.0
  drift_dev: ^2.34.0
  flutter_lints: ^6.0.0
  mocktail: ^1.0.0
```

- [ ] Run:

```bash
cd apps/flutter
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
```

Expected: all commands succeed and `build/app/outputs/flutter-apk/app-debug.apk` exists.

- [ ] Commit:

```bash
git add apps/flutter .gitignore
git commit -m "feat(flutter): scaffold Android tracker app"
```

## Task 2: Add environment-safe bootstrap

**Files:**
- Create: `apps/flutter/lib/app/app_environment.dart`
- Create: `apps/flutter/lib/app/app_bootstrap.dart`
- Modify: `apps/flutter/lib/main.dart`
- Test: `apps/flutter/test/app/app_environment_test.dart`

**Produces:**

```dart
class AppEnvironment {
  const AppEnvironment({required this.supabaseUrl, required this.supabasePublishableKey});
  factory AppEnvironment.fromDefines();
}

Future<ProviderContainer> bootstrapApplication(AppEnvironment environment);
```

- [ ] Write failing tests asserting empty `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` throw `StateError`.

- [ ] Implement:

```dart
class AppEnvironment {
  const AppEnvironment({
    required this.supabaseUrl,
    required this.supabasePublishableKey,
  });

  final String supabaseUrl;
  final String supabasePublishableKey;

  factory AppEnvironment.fromDefines() {
    const url = String.fromEnvironment('SUPABASE_URL');
    const key = String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');
    if (url.isEmpty || key.isEmpty) {
      throw StateError('Supabase configuration is missing.');
    }
    return const AppEnvironment(
      supabaseUrl: url,
      supabasePublishableKey: key,
    );
  }
}
```

- [ ] Initialize Supabase once inside `bootstrapApplication`:

```dart
await Supabase.initialize(
  url: environment.supabaseUrl,
  anonKey: environment.supabasePublishableKey,
);
```

- [ ] Update `main()` to call `WidgetsFlutterBinding.ensureInitialized()`, load environment, bootstrap providers, and run the app.

- [ ] Verify:

```bash
flutter test test/app/app_environment_test.dart
flutter analyze
```

- [ ] Commit:

```bash
git add apps/flutter/lib/app apps/flutter/lib/main.dart apps/flutter/test/app
git commit -m "feat(flutter): add Supabase bootstrap configuration"
```

## Task 3: Define domain models and validation

**Files:**
- Create: `apps/flutter/lib/domain/app_models.dart`
- Create: `apps/flutter/lib/domain/pending_operation.dart`
- Create: `apps/flutter/lib/domain/validation.dart`
- Test: `apps/flutter/test/domain/validation_test.dart`

**Produces:** `TrackerModel`, `TrackingLogModel`, `UserSettingsModel`, `PendingOperation`, `PendingOperationType`, and validated input objects.

- [ ] Write failing tests for valid tracker input, empty names, non-positive presets, non-positive log values, and notes over 500 characters.

- [ ] Define enums:

```dart
enum ThemePreference { system, light, dark }
enum EntitySyncState { synced, pending, failed }
enum PendingOperationType {
  upsertTracker,
  deleteTracker,
  upsertLog,
  deleteLog,
  saveSettings,
}
```

- [ ] Define immutable models mirroring existing Supabase fields:

```dart
class TrackerModel {
  const TrackerModel({
    required this.id,
    required this.userId,
    required this.name,
    required this.unit,
    required this.icon,
    required this.color,
    required this.goal,
    required this.presets,
    required this.active,
    required this.sortOrder,
    required this.createdAt,
    required this.updatedAt,
    required this.syncState,
    this.deletedAt,
  });
  // fields + copyWith + toJson/fromJson
}
```

Define equivalent `TrackingLogModel` and `UserSettingsModel` using the approved spec.

- [ ] Implement validation with exact rules:
  - tracker name: 1–80 trimmed characters;
  - unit: 1–30 trimmed characters;
  - icon: 1–8 characters;
  - at least one unique positive preset;
  - optional goal must be positive;
  - log value must be finite and positive;
  - note maximum 500 characters.

- [ ] Verify:

```bash
flutter test test/domain/validation_test.dart
```

- [ ] Commit:

```bash
git add apps/flutter/lib/domain apps/flutter/test/domain
git commit -m "feat(flutter): define tracker domain models"
```

## Task 4: Add routing, theme, and Auth

**Files:**
- Create: `apps/flutter/lib/app/app.dart`
- Create: `apps/flutter/lib/app/app_router.dart`
- Create: `apps/flutter/lib/app/app_theme.dart`
- Create: `apps/flutter/lib/auth/auth_repository.dart`
- Create: `apps/flutter/lib/auth/auth_controller.dart`
- Create: `apps/flutter/lib/auth/auth_screen.dart`
- Test: `apps/flutter/test/auth/auth_screen_test.dart`

**Produces:** Supabase email/password sign-in/sign-up and guarded navigation shell.

- [ ] Write widget tests verifying email/password fields, sign-in button, create-account button, validation feedback, and loading state.

- [ ] Implement repository:

```dart
abstract interface class AuthRepository {
  Stream<AuthState> get authChanges;
  User? get currentUser;
  Future<void> signIn(String email, String password);
  Future<void> signUp(String email, String password);
  Future<void> signOut();
}
```

`SupabaseAuthRepository` delegates to `Supabase.instance.client.auth` and never exposes raw service keys.

- [ ] Implement Riverpod `AuthController` with states `checking`, `signedOut`, `submitting`, `signedIn`, and `error`.

- [ ] Configure `go_router` routes:

```text
/login
/home
/history
/trackers
/settings
```

Redirect unauthenticated users to `/login` and authenticated users away from `/login` to `/home`.

- [ ] Implement system/light/dark Material 3 themes; preserve current tracker design direction but optimize for Android phone layouts.

- [ ] Verify:

```bash
flutter test test/auth/auth_screen_test.dart
flutter analyze
```

- [ ] Commit:

```bash
git add apps/flutter/lib/app apps/flutter/lib/auth apps/flutter/test/auth
git commit -m "feat(flutter): add authentication and navigation"
```
