# Repository Guidelines

## Project Structure & Module Organization

This is a build-free static web application served from the repository root.

- `index.html` contains the application shell and loads `styles.css` and `app.js`.
- `app.js` loads Supabase and the runtime bundles in dependency order.
- `app-1.js` defines configuration, shared state, and utility functions.
- `app-2.js` handles Supabase persistence, cloud loading, and the offline queue.
- `app-3a.js` contains rendering functions; `app-3b.js` contains tracker/log interactions and modals.
- `app-4a.js` handles settings, import/export, sample data, and destructive operations.
- `app-4b.js` binds events, updates connection state, and initializes the app.
- `styles.css` contains all responsive and theme styling.

No asset or test directories exist. Release tooling lives in `package.json`, commitlint configuration in `commitlint.config.cjs`, and Git hooks under `.husky/`. Preserve the runtime bundle order in `app.js`.

## Build, Test, and Development Commands

Install contributor tooling with `npm install`. The app remains build-free. Serve it locally because ES modules are unreliable over `file://`:

```powershell
python -m http.server 8080
```

Open `http://localhost:8080`. `npm run commitlint` checks the latest commit. Use `npm run release:first:dry` for the initial release preview and `npm run release:dry` thereafter. Run `git diff --check` before committing. GitHub Pages deploys from the `main` branch root.

## Coding Style & Naming Conventions

Use two-space indentation, single-quoted JavaScript strings, and semicolons. Use `camelCase` for variables and functions, `UPPER_SNAKE_CASE` for constants, and kebab-case CSS classes. Prefer existing helpers such as `$`, `$$`, and `escapeHtml`. Escape user-provided content before inserting HTML.

## Testing Guidelines

There is no automated test framework yet. Manually verify authentication, tracker/log CRUD, persistence, offline recovery, responsive layouts, themes, and import/export. Test UI changes in light and dark modes. Put future automated tests under `tests/` and document their runner in `README.md`.

## Commit & Pull Request Guidelines

Use Conventional Commits, enforced by Husky: `feat: add cloud sync status`, `fix: prevent duplicate offline records`, or `docs: update setup instructions`. Mark incompatible changes with `!` or a `BREAKING CHANGE:` footer. Keep commits focused. Pull requests should explain the change, list manual checks, link issues, include screenshots for visual work, and note Supabase schema or RLS dependencies.

## Security & Configuration

Only the Supabase project URL and publishable key may appear in frontend code. Never commit secret keys, service-role keys, database passwords, access tokens, or `.env` files. All exposed tables must retain appropriate Row Level Security policies.
