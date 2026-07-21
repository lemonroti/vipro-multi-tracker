# Part 4 — Verification and APK Delivery

## Task 13: Add deterministic integration coverage

**Files:**
- Create: `apps/flutter/integration_test/app_flow_test.dart`
- Create: `apps/flutter/test/support/fakes.dart`
- Modify: `apps/flutter/lib/app/app_bootstrap.dart`

**Produces:** injectable test runtime and deterministic end-to-end Flutter flow without touching production Supabase.

- [ ] Add test runtime interfaces for Auth, CloudRepository, clock, UUID source, and connectivity state.

- [ ] Write integration flow covering:

```text
start signed out
→ sign in with fake account
→ create tracker
→ quick record online
→ switch fake connectivity offline
→ add manual record
→ confirm pending count increases
→ restore connectivity
→ run sync
→ confirm cloud fake contains both records
→ edit latest record
→ delete first record
→ sign out
```

- [ ] Run:

```bash
flutter test integration_test/app_flow_test.dart
```

Expected: PASS without network access.

- [ ] Commit:

```bash
git add apps/flutter/integration_test apps/flutter/test/support apps/flutter/lib/app/app_bootstrap.dart
git commit -m "test(flutter): cover offline tracker flow"
```

## Task 14: Add branch-only Android CI and APK artifact

**Files:**
- Create: `.github/workflows/flutter-android.yml`
- Modify: `apps/flutter/README.md`

**Produces:** verification workflow triggered only by `flutter-android-mvp` and manual dispatch.

- [ ] Create workflow:

```yaml
name: Flutter Android

on:
  push:
    branches:
      - flutter-android-mvp
  workflow_dispatch:

permissions:
  contents: read

jobs:
  verify-and-build:
    runs-on: ubuntu-latest
    timeout-minutes: 35
    defaults:
      run:
        working-directory: apps/flutter
    steps:
      - uses: actions/checkout@v6
      - uses: subosito/flutter-action@v2
        with:
          channel: stable
          cache: true
      - run: flutter --version
      - run: flutter pub get
      - run: dart run build_runner build --delete-conflicting-outputs
      - run: dart format --output=none --set-exit-if-changed lib test integration_test
      - run: flutter analyze
      - run: flutter test
      - name: Build debug APK
        env:
          SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
          SUPABASE_PUBLISHABLE_KEY: ${{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}
        run: >
          flutter build apk --debug
          --dart-define=SUPABASE_URL=$SUPABASE_URL
          --dart-define=SUPABASE_PUBLISHABLE_KEY=$SUPABASE_PUBLISHABLE_KEY
      - uses: actions/upload-artifact@v4
        with:
          name: vipro-multi-tracker-debug-apk
          path: apps/flutter/build/app/outputs/flutter-apk/app-debug.apk
          if-no-files-found: error
          retention-days: 14
```

- [ ] Document local commands and APK installation:

```bash
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter analyze
flutter test
flutter build apk --debug \
  --dart-define=SUPABASE_URL=<project-url> \
  --dart-define=SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Install with:

```bash
adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

- [ ] Commit:

```bash
git add .github/workflows/flutter-android.yml apps/flutter/README.md
git commit -m "ci(flutter): build downloadable Android APK"
```

## Task 15: Apply and verify the sync migration safely

**Files:**
- No new application files unless verification finds an issue.

**Produces:** linked Supabase schema compatible with Flutter synchronization.

- [ ] Confirm current branch and clean working tree.

- [ ] Compare migration history:

```bash
npx supabase login
npx supabase link --project-ref hqdjbdkxvexuduvqccpc
npx supabase migration list --linked
npx supabase db push --dry-run
```

Expected: dry run shows only the reviewed backward-compatible timestamp migration. If it shows the existing baseline as pending, repair only the verified baseline per the repository README before continuing.

- [ ] Apply:

```bash
npx supabase db push
npx supabase db lint --linked
```

- [ ] Verify with SQL that all three tables contain `updated_at`, triggers exist, RLS remains enabled, and current policies remain present.

- [ ] Run Supabase security and performance advisors. Security must report no missing-RLS exposure.

- [ ] Commit only if the verification required a migration correction. Never commit CLI tokens or linked credentials.

## Task 16: Final verification and artifact retrieval

**Files:**
- Modify only files required to fix verification failures.

**Produces:** evidence-backed completion and downloadable APK.

- [ ] Run complete local verification:

```bash
cd apps/flutter
dart run build_runner build --delete-conflicting-outputs
dart format --output=none --set-exit-if-changed lib test integration_test
flutter analyze
flutter test
flutter build apk --debug \
  --dart-define=SUPABASE_URL=https://hqdjbdkxvexuduvqccpc.supabase.co \
  --dart-define=SUPABASE_PUBLISHABLE_KEY=<publishable-key>
cd ../..
npm run typecheck
npm run lint
npm run test
git diff --check
git status --short
```

Expected: all commands exit 0, only intended Flutter-branch files differ from `main`, and the APK exists.

- [ ] Compare branch against main:

```bash
git diff --name-status main...flutter-android-mvp
git log --oneline main..flutter-android-mvp
```

Expected: `main` has no new commits; Flutter work exists only on `flutter-android-mvp`.

- [ ] Push the branch and wait for `Flutter Android` workflow success.

- [ ] Download workflow artifact `vipro-multi-tracker-debug-apk`, extract `app-debug.apk`, and verify its SHA-256:

```bash
sha256sum app-debug.apk
```

- [ ] Install on Android and manually verify:
  - account sign-in;
  - existing trackers and logs load;
  - create/edit/delete tracker;
  - online quick record;
  - offline manual record and later sync;
  - widget configuration;
  - one-tap widget record while online;
  - one-tap widget record while offline and later sync;
  - system/light/dark theme;
  - sign-out account isolation.

- [ ] Do not merge into `main`. Report branch name, workflow run, APK artifact, checksum, known limitations, and test evidence.
