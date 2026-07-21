# Clean SaaS Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Implement the approved Clean SaaS visual redesign on `dev` while preserving every existing feature, DOM hook, state flow, and Supabase behavior.

**Architecture:** Keep the current Vite/TypeScript application and custom CSS. Add locally bundled Geist Variable font assets and a small shared Lucide icon renderer, then limit UI changes to shell markup, presentation-only feature templates, and `src/styles/app.css`. Existing controllers, services, store contracts, IDs, and `data-*` event hooks remain intact.

**Tech Stack:** Vite 8, TypeScript 6, vanilla DOM controllers, custom CSS, Vitest, Playwright, `@fontsource-variable/geist`, and framework-agnostic `lucide`.

---

## Task 1: Lock the approved design contract

**Files:**
- Modify: `docs/superpowers/specs/2026-07-21-clean-saas-redesign-design.md`
- Create: `docs/superpowers/plans/2026-07-21-clean-saas-redesign.md`

- [x] Correct the font dependency in the approved spec from the Next.js-oriented `geist` package to the Vite-compatible `@fontsource-variable/geist` package.
- [x] Record this executable plan with exact files, checks, and commit boundaries.
- [x] Run `git diff --check` and inspect the plan for incomplete markers.
- [ ] Commit with `git add docs/superpowers && git commit -m "docs: plan clean SaaS implementation"`.

## Task 2: Establish failing presentation contracts

**Files:**
- Create: `src/shared/icons.test.ts`
- Modify: `tests/e2e/responsive-theme.spec.ts`

- [x] Add a unit test that mounts `<i data-lucide="house">`, calls `renderIcons`, and expects an inline SVG with `aria-hidden="true"` while preserving the host class.
- [x] Run `npm run test -- src/shared/icons.test.ts` and confirm the missing helper causes the expected RED failure.
- [x] Add Playwright assertions that the computed body font includes `Geist Variable`, the visible navigation uses inline Lucide SVGs, primary dashboard actions remain visible, and a 390px page has no horizontal overflow.
- [x] Run `npx playwright test tests/e2e/responsive-theme.spec.ts --project=chromium-mobile` and confirm the unimplemented font/icon assertions fail for the expected reason.

## Task 3: Add the locally bundled font and icon foundation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/shared/icons.ts`
- Modify: `src/main.ts`

- [x] Install exact versions with `npm install --save-exact @fontsource-variable/geist@5.3.0 lucide@1.25.0`.
- [x] Import `@fontsource-variable/geist/wght.css` from `src/main.ts` so Vite owns font delivery.
- [x] Implement `renderIcons(root)` with a constrained Lucide icon map and accessible SVG defaults. It must render only icons used by this app and safely support repeated dynamic renders.
- [x] Call `renderIcons()` after static startup and after feature rendering so icons inserted via `innerHTML` are upgraded.
- [x] Run `npm run test -- src/shared/icons.test.ts`, `npm run typecheck`, and `npm run lint`; make the new unit contract GREEN without weakening it.
- [ ] Commit with `git add package.json package-lock.json src/main.ts src/shared && git commit -m "feat: add local Geist font and icons"`.

## Task 4: Modernize the semantic application shell

**Files:**
- Modify: `index.html`
- Modify: `src/features/dashboard/index.ts`
- Modify: `src/features/history/index.ts`
- Modify tests beside changed feature controllers when their exact rendered markup assertions require updates.

- [x] Replace sidebar and mobile navigation glyphs with `<i data-lucide>` placeholders while preserving link names, `data-nav`, hrefs, and active-state behavior.
- [x] Add Lucide icons to contextual create/add controls where they improve hierarchy without changing accessible names.
- [x] Replace modal close glyphs, dashboard overflow actions, and history edit/delete glyphs with Lucide placeholders; retain every ID, `data-*` action hook, title, and `aria-label`.
- [x] Keep tracker emoji and empty-state content symbols unchanged because they are user/content semantics rather than navigation controls.
- [x] Ensure the feature render cycle calls `renderIcons` after its dynamic templates are assigned.
- [x] Run focused tests for the changed dashboard, history, and icon renderers, then run `npm run test`.
- [x] Commit the application iconography as `feat: refine application iconography`.

## Task 5: Implement the Clean SaaS design system

**Files:**
- Rewrite: `src/styles/app.css`

- [x] Reformat the stylesheet into readable token, reset/base, shell, component, feature, state, accessibility, and responsive sections.
- [x] Define coherent light/dark semantic tokens for canvas, surfaces, text, borders, brand, status, shadow, radius, spacing, and focus rings.
- [x] Apply `Geist Variable` globally with system fallbacks and tabular numerals for metrics, values, and charts.
- [x] Redesign the sidebar, top bar, mobile navigation, buttons, cards, tracker progress/actions, activity lists, chart, filters, settings, auth, modals, toast, sync badge, and offline banner to match the approved precise neutral/violet direction.
- [x] Preserve the 252px desktop sidebar and current breakpoints at 640px, 760px, 900px, and 1200px.
- [x] Add clear `:focus-visible`, hover, active, disabled, busy, offline, destructive, and dark-mode states.
- [x] Add `overflow-x: clip` protection, min-width safeguards, safe-area bottom navigation padding, and mobile action wrapping so 390px never scrolls horizontally.
- [x] Add `prefers-reduced-motion: reduce` to remove non-essential animation, transforms, transitions, and smooth scrolling.
- [x] Run `npm run typecheck`, `npm run lint`, `npm run test`, and the focused responsive Playwright spec.
- [x] Commit the completed visual layer, browser contract, favicon, and generated-artifact ignore rules together as `feat: modernize tracker interface`.

## Task 6: Verify every visual and behavioral state

**Files:**
- Modify only files needed to fix verified regressions.
- Generated and ignored: `test-results/`, `dist/`, and local screenshot artifacts.

- [ ] Run the complete gate: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:e2e`, `npm run build`, and `git diff --check`.
- [x] Start the Vite app with the populated browser fixture and inspect dashboard, history, trackers, settings, auth, tracker modal, and log modal at 1280x800 and 390x844.
- [x] Inspect both light and dark themes, keyboard focus, active navigation, sync/offline status, primary action visibility, and mobile bottom navigation.
- [x] Confirm browser console has no errors and `scrollWidth <= clientWidth` at 390px.
- [ ] Inspect `dist/` to confirm font files and Lucide code are bundled, with no runtime Google Fonts, Fontsource, Geist, or Lucide CDN URLs.
- [ ] If verification reveals a regression, add or strengthen the failing test first, implement the smallest presentation-only fix, rerun the focused check, and then rerun the complete gate.

## Task 7: Publish and verify the development branch

- [ ] Confirm `git status --short --branch` shows only intentional commits on `dev` and review `git diff origin/dev...HEAD --stat`.
- [ ] Push with `git push origin dev`; this triggers CI but not GitHub Pages deployment.
- [ ] Monitor the pushed commit's GitHub Actions Application and Database jobs until both pass.
- [ ] Confirm `dev` tracks `origin/dev` and the worktree is clean.

## Task 8: Regular-merge and verify production

**Files:**
- Merge the complete `dev` history into `main`; do not squash or rebase it.

- [ ] Check out `main`, pull it with `--ff-only`, and confirm it has no unexpected remote changes.
- [ ] Create a regular `--no-ff` merge commit from `dev` into `main` with a Conventional Commit message.
- [ ] Push `main` and monitor both CI jobs plus the GitHub Pages deployment until all pass.
- [ ] Open the production URL and verify the Clean SaaS UI, bundled Geist font, Lucide icons, and absence of browser console errors.
- [ ] Fast-forward `dev` to the production merge commit, push it, and leave the repository on a clean, synchronized `dev` branch for the next change.
