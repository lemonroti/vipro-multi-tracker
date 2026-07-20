# Vipro Multi Tracker

Responsive multi-tracker web app with custom units, offline-first logging, and Supabase cloud sync.

## Stack

- HTML, CSS, Vanilla JavaScript
- Supabase Auth, PostgreSQL and Row Level Security
- GitHub Pages
- Browser localStorage offline queue

## Local development

Install the contributor and release tooling:

```bash
npm install
```

Serve this directory with a local web server. ES modules will not work reliably from `file://`.

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Releases

Commits follow the Conventional Commits format and are checked by Husky. Establish the initial `v0.1.0` baseline once with `npm run release:first:dry`, review the preview, and then run `npm run release:first`. For later releases, use `npm run release:dry` before `npm run release`. Release commands update `CHANGELOG.md` and version files, create a release commit, and add a local Git tag; they do not push automatically.

## Production setup

1. Supabase project: `vipro-multi-tracker`
2. Enable Email + Password signups.
3. Disable email confirmation for the initial release.
4. Set the Site URL and redirect URLs to the GitHub Pages URL.
5. Enable GitHub Pages from the `main` branch root.

The frontend contains only the Supabase publishable key. Never commit secret or service-role keys.
