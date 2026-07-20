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

Use the URL printed by Vite. The typed application remains available in shadow mode with
`?runtime=typed` until the legacy parity checks are complete.

## Supabase schema workflow

The `supabase/` directory versions the database schema and is safe to commit. It does not contain
database credentials. A local Supabase stack requires Docker and the Supabase CLI:

```bash
npx supabase start
npx supabase db reset --local
npx supabase db lint --local
```

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

## Releases

Commits follow the Conventional Commits format and are checked by Husky. Establish the initial `v0.1.0` baseline once with `npm run release:first:dry`, review the preview, and then run `npm run release:first`. For later releases, use `npm run release:dry` before `npm run release`. Release commands update `CHANGELOG.md` and version files, create a release commit, and add a local Git tag; they do not push automatically.

## Production setup

1. Supabase project: `vipro-multi-tracker`
2. Enable Email + Password signups.
3. Disable email confirmation for the initial release.
4. Set the Site URL and redirect URLs to the GitHub Pages URL.
5. Enable GitHub Pages from the `main` branch root.

The frontend contains only the Supabase publishable key. Never commit secret or service-role keys.
