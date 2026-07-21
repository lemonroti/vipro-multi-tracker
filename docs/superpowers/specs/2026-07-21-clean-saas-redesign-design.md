# Clean SaaS UI Redesign

**Date:** 2026-07-21

**Status:** Approved direction

**Superdesign preview:** https://p.superdesign.dev/draft/0f81596b-fb9c-476b-ac66-de00210626e4

## Goal

Modernize My Tracker into a calm, precise SaaS interface while preserving every existing feature,
view, DOM contract, responsive flow, state transition, Supabase interaction, and offline behavior.
The redesign uses Geist and the existing custom CSS architecture. It does not introduce Tailwind or
a JavaScript component framework.

## Non-goals

- No changes to domain models, state, services, Supabase, RLS, migrations, or persistence.
- No new product features or navigation destinations.
- No React, Vue, Svelte, Tailwind, Bootstrap, or UI component library.
- No replacement of existing tracker colors or user-provided emoji.
- No copy rewrite beyond small accessibility labels where necessary.

## Visual direction

The approved direction is Clean SaaS: neutral surfaces, clear hierarchy, precise borders, restrained
radius and elevation, compact status indicators, and violet used only for active, focused, progress,
and primary-action states. The interface should feel capable and professional without becoming
dense or clinical.

The existing desktop composition remains familiar:

1. Fixed sidebar with identity, four destinations, and sync status.
2. Sticky top bar with greeting, title, sync badge, and contextual action.
3. Three summary metrics.
4. Quick-record tracker cards.
5. Recent activity and seven-day totals.

Mobile retains the sticky page header, single-column content, bottom navigation, and bottom-sheet
modal behavior.

## Typography and font delivery

Use Geist Sans for the entire UI. Load it from the version-pinned
`@fontsource-variable/geist` npm package so the production site does not depend on a runtime font
CDN. This package provides the Geist variable font as standard CSS/font assets that Vite can bundle;
the `geist` package itself exposes Next.js-specific font modules and is not suitable for this app.
The Vite build must bundle the font assets.
The fallback remains `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
sans-serif`.

Typography rules:

- Body and supporting text: 400-500 weight.
- Labels and controls: 550-600 weight.
- Section headings and titles: 650-700 weight.
- Primary metrics: 700-750 weight with compact tracking.
- Keep body text at or above 12px and interactive labels at or above 13px.
- Use `font-variant-numeric: tabular-nums` for metrics, values, and chart labels.

Geist is distributed by Vercel under the SIL Open Font License 1.1. Fontsource packages its font
files for framework-agnostic bundlers such as Vite.

## Design tokens

Retain semantic CSS variables and expand them instead of hardcoding colors throughout selectors.

Light theme:

- Canvas: warm-neutral near-white based on the existing `--bg`.
- Primary surface: white.
- Secondary surface: light neutral slate.
- Text: deep slate.
- Muted text: medium slate with accessible contrast.
- Border: neutral 1px line.
- Brand: current violet `#6d4aff`.

Dark theme:

- Canvas and surfaces remain deep navy/slate.
- Text remains near-white with distinct muted levels.
- Border contrast must be visible without becoming bright.
- Brand uses the current lighter violet `#9b87ff`.

Semantic success, pending/offline, and danger colors remain distinct. Introduce component-level
tokens for 10px control radius, 14-16px card radius, subtle focus rings, compact shadow, and standard
spacing. Remove the existing large ambient card shadow from normal surfaces; reserve stronger
elevation for modals and toasts.

## Shared components

### Application shell

- Reduce sidebar visual weight while preserving its 252px desktop footprint.
- Use a violet-tinted active navigation surface with an explicit icon and text state.
- Keep the top bar sticky and visually separated by a 1px border.
- Preserve page-title and contextual-action updates from `ShellController`.

### Buttons and controls

- Standard height: 40-44px; small controls may remain 34-36px.
- Primary actions use violet with white text.
- Secondary actions use neutral borders and surfaces.
- Ghost actions remain quiet but gain a visible hover/focus surface.
- Danger controls continue using the semantic danger token.
- Every interactive control requires visible keyboard focus.

### Cards and metrics

- Cards use 14-16px radius and precise neutral borders.
- Summary cards use typography and spacing rather than large shadows for hierarchy.
- Tracker cards retain icon, latest activity, total, goal, progress, quick values, custom action,
  and edit action.
- Tracker-specific colors remain limited to icon treatment, progress, and quick-record emphasis.

### Activity and chart panels

- Activity rows become compact, clearly separated list items.
- Values align visually and use tabular numbers.
- The chart retains seven columns, tracker selection, hover labels, and tracker color.
- Empty states remain available and visually consistent with standard surfaces.

### Forms, modals, toast, and status

- Inputs use 10px radius, 44px minimum height, and visible focus rings.
- Desktop modals stay centered; mobile modals stay bottom sheets.
- Toast behavior and undo action remain unchanged.
- Online, syncing, pending, and offline status always use both text and a visual indicator.

## Responsive behavior

Keep the existing breakpoint behavior unless a visual regression demonstrates a need for a small
adjustment:

- Below 640px: single-column content and bottom-sheet modals.
- From 640px: three summary columns where space permits, two-column forms/settings, centered modals.
- From 760px: show the compact sync badge.
- From 900px: show fixed sidebar, hide mobile navigation, use two-column tracker and lower grids.
- From 1200px: allow three tracker cards when three or more are active.

At 390px width, all actions must remain reachable without horizontal scrolling, and the mobile
bottom navigation must respect safe-area insets.

## Icons

Replace the current navigation and action text symbols with Lucide outline icons from the pinned
framework-agnostic `lucide` npm package. Bundle the icons through Vite; do not load a runtime icon
CDN. User-selected tracker emoji are content and must remain unchanged. Icons must have accessible
names when the adjacent text does not already provide one.

## Accessibility and motion

- Preserve semantic buttons, links, forms, labels, dialogs, and status regions.
- Maintain at least 42px primary touch targets.
- Meet WCAG AA contrast for text, controls, borders required to identify inputs, and focus states.
- Keep hover, focus-visible, active, disabled, busy, offline, and destructive states distinct.
- Add a `prefers-reduced-motion: reduce` rule that removes non-essential transforms and smooth scroll.
- Do not rely on color alone to communicate tracker progress or connection status.

## Architecture and implementation boundaries

The redesign is isolated to presentation concerns:

- `index.html`: icon markup or small semantic structure adjustments only; retain IDs and data attributes.
- `src/styles/app.css`: reorganize into readable token, base, layout, component, state, and responsive sections.
- Feature renderers: update visual markup/classes only where required; preserve escaping and event data attributes.
- `package.json` and lockfile: add only the pinned `@fontsource-variable/geist` and `lucide`
  dependencies.

Do not change controller interfaces, store contracts, repository behavior, or data flow. Existing IDs,
`data-*` hooks, and `hidden` behavior are regression-sensitive contracts.

## Error and state coverage

The redesigned UI must represent all current states:

- Signed out, signing in, sign-up, authentication error, and signed in.
- Loading, empty, populated, and repository startup failure.
- Online/synced, syncing, pending changes, and offline.
- Modal open/closed, validation error, busy controls, and destructive confirmation.
- Light, dark, and system theme.

## Verification

Automated verification must include:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run test:e2e`
- `npm run build`
- `git diff --check`

Playwright must continue covering authentication visibility, tracker/log CRUD, offline recovery,
desktop navigation, mobile navigation, and theme persistence. Add focused assertions for Geist font
application, absence of horizontal overflow at 390px, and preserved action visibility. Manually
inspect dashboard, history, trackers, settings, authentication, tracker modal, and log modal in both
light and dark themes at desktop and mobile widths.

## Acceptance criteria

- The implementation matches the approved Superdesign direction.
- Geist is bundled locally through Vite and visible across the entire application.
- No Tailwind or application framework is introduced.
- All current features and data behavior remain unchanged.
- Desktop and mobile layouts remain fully usable with no horizontal overflow.
- Light and dark themes are coherent and accessible.
- All automated checks pass and production build output contains no runtime font or icon CDN dependency.
