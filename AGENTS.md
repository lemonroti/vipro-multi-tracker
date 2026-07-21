# Repository Guidelines

## Project Structure & Module Organization

This is a Vite and TypeScript static web application. `index.html` is the application shell and
`src/main.ts` is the only runtime entry point.

- `src/domain/` contains validated models, schemas, defaults, and offline operations.
- `src/state/` owns the application store.
- `src/services/` contains auth, Supabase repositories, cache, queue, sync, cloud state, and backup logic.
- `src/features/` contains the UI controllers for each application area.
- `src/runtime/` composes production adapters; `src/testing/` contains dev-only browser fixtures.
- `src/styles/` contains responsive and theme styling.
- `tests/e2e/` contains Playwright browser flows.
- `supabase/migrations/` contains the versioned PostgreSQL schema.
- `dist/` is generated deployment output and must not be edited or committed.

Release tooling lives in `package.json`, commitlint configuration in `commitlint.config.cjs`, and
Git hooks under `.husky/`.

## Build, Test, and Development Commands

Install contributor tooling with `npm install`, then start Vite:

```powershell
npm run dev
```

Run the complete application verification gate with:

```powershell
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
git diff --check
```

`npm run commitlint` checks the latest commit. Use `npm run release:dry` for release previews; do
not rerun the completed first-release workflow. GitHub Pages deploys the generated `dist/`
directory through GitHub Actions only from `main`; `dev` must never deploy production.

## Coding Style & Naming Conventions

Use two-space indentation, single-quoted JavaScript strings, and semicolons. Use `camelCase` for variables and functions, `UPPER_SNAKE_CASE` for constants, and kebab-case CSS classes. Prefer existing helpers such as `$`, `$$`, and `escapeHtml`. Escape user-provided content before inserting HTML.

## Testing Guidelines

Vitest covers domain, services, state, feature controllers, and migration contracts. Playwright covers
authentication visibility, tracker/log CRUD, offline recovery, responsive layouts, and themes with
deterministic dev-only fixtures. Manually verify production Supabase authentication and cloud loading
without changing real data; use a backup/test account for destructive import, clear, reset, or sample-data checks.

## Commit & Pull Request Guidelines

Use Conventional Commits, enforced by Husky: `feat: add cloud sync status`, `fix: prevent duplicate offline records`, or `docs: update setup instructions`. Mark incompatible changes with `!` or a `BREAKING CHANGE:` footer. Keep Git tags as `vX.Y.Z` and title GitHub Releases `Version X.Y.Z`. Keep commits focused. Pull requests should explain the change, list manual checks, link issues, include screenshots for visual work, and note Supabase schema or RLS dependencies.

## Security & Configuration

Only the Supabase project URL and publishable key may appear in frontend code. Never commit secret keys, service-role keys, database passwords, access tokens, or `.env` files. All exposed tables must retain appropriate Row Level Security policies.
