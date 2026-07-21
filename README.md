# Vipro Multi Tracker

Responsive multi-tracker web app with custom units, offline-first logging, and Supabase cloud sync.

## Stack

- Vite, TypeScript, HTML and CSS
- Supabase Auth, PostgreSQL and Row Level Security
- GitHub Pages
- Browser localStorage offline queue

## Local development

Install the contributor and release tooling:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Use the URL printed by Vite. `src/main.ts` is the only application entry point.

Run the local code-quality and unit-test checks with:

```bash
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
git diff --check
```

Browser tests use deterministic development-only fixtures and never contact production
Supabase. After installing Chromium with `npx playwright install chromium`, run them with
`npm run test:e2e`. Installing the browser locally is optional because GitHub Actions runs the
complete browser suite in the cloud.

## Application architecture

- `src/domain/` contains validated application models, schemas, defaults, and offline operations.
- `src/state/` owns the in-memory application store.
- `src/services/` contains auth, persistence, cache, queue, sync, cloud loading, and backup logic.
- `src/features/` contains DOM controllers for auth, shell, dashboard, history, trackers, logs, and settings.
- `src/runtime/` composes the production Supabase adapters behind application interfaces.
- `src/testing/` contains development-only deterministic browser fixtures.
- `src/styles/` contains the responsive application styles.
- `tests/e2e/` contains Playwright browser flows; `tests/migrations.test.ts` verifies migration contracts.
- `supabase/migrations/` is the versioned PostgreSQL schema history.

Vite compiles the application to `dist/`. GitHub Pages deploys that generated directory; do not
edit or commit `dist/` directly. Only `main` deploys production. The `dev` branch runs verification
but never deploys.

## Supabase schema workflow

The `supabase/` directory versions the database schema and is safe to commit. It does not contain
database credentials. A local Supabase stack requires Docker and the Supabase CLI:

```bash
npx supabase start
npx supabase db reset --local
npx supabase db lint --local
```

Local Docker is optional. The CI workflow starts a database-only Supabase stack on a standard
GitHub-hosted runner, replays every migration, lints the database, and always stops the stack.
This keeps the heavy database check off contributor PCs. The CLI is pinned in `package.json`, so
use the repository command through `npx supabase` rather than downloading an unpinned version.

Create each future schema change as a migration, review the generated SQL, then replay the complete
local chain before committing it:

```bash
npx supabase migration new <descriptive-name>
npx supabase db reset --local
npx supabase db lint --local
```

To inspect a remote project without storing credentials in the repository, authenticate with the
CLI, link the project, then pull or lint explicitly against the linked database:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db pull <descriptive-name>
npx supabase db lint --linked
npx supabase migration list --linked
```

`20260720221743_remote_schema.sql` is a baseline of schema that already exists in the current
production project. Do not apply or push that baseline blindly: it attempts to create the existing
tables. Before the first migration-based production deployment, compare the linked migration
history and schema, review the baseline statement by statement, then mark only that verified
baseline as already applied. Preview later migrations before deploying:

```bash
npx supabase migration repair 20260720221743 --status applied
npx supabase db push --dry-run
npx supabase db push
```

Never run `db reset --linked` against production. Never commit access tokens, database passwords,
service-role keys, or environment files.

## Continuous integration and deployment

Pull requests and pushes to `dev` or `main` run typechecking, linting, unit tests, deterministic
Chromium browser tests, a production build, and the database migration replay in GitHub Actions.
These checks require no production credentials or Supabase project access.

GitHub Pages deploys only from pushes to `main` or a manual run of the Pages workflow. The `dev`
branch never deploys. Before the first deployment, create these public GitHub repository variables
under **Settings → Secrets and variables → Actions → Variables**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Use only the public project URL and publishable key. Do not put a service-role key, database
password, access token, or other secret in repository variables or workflow files.

## Releases

Commits follow the Conventional Commits format and are checked by Husky. Establish the initial `v0.1.0` baseline once with `npm run release:first:dry`, review the preview, and then run `npm run release:first`. For later releases, use `npm run release:dry` before `npm run release`. Release commands update `CHANGELOG.md` and version files, create a release commit, and add a local Git tag; they do not push automatically.

## Production setup

1. Supabase project: `vipro-multi-tracker`
2. Enable Email + Password signups.
3. Disable email confirmation for the initial release.
4. Set the Site URL and redirect URLs to the GitHub Pages URL.
5. Set Pages to use GitHub Actions; `.github/workflows/pages.yml` builds `dist/` and deploys only
   from `main`.

The frontend contains only the Supabase publishable key. Never commit secret or service-role keys.
