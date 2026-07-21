# My Tracker Design System Baseline

## Product context

My Tracker is a responsive personal multi-tracker for fast daily recording, cloud synchronization,
offline recovery, history review, tracker configuration, and backup. The interface must work equally
well on desktop and narrow mobile screens. Existing IDs, form semantics, view structure, theme
behavior, and test selectors remain functional constraints.

## Confirmed redesign constraints

- Keep the existing Vite, TypeScript, semantic HTML, and custom CSS architecture.
- Do not introduce Tailwind or a component framework.
- Use Geist as the primary UI font, with a local/system sans-serif fallback.
- Preserve light, dark, and system theme choices.
- Preserve dashboard, history, trackers, settings, authentication, modal, offline, sync, and toast flows.
- Modernize presentation without changing Supabase, state, persistence, or business behavior.

## Current visual foundation

- Brand accent: violet `#6d4aff` in light mode and `#9b87ff` in dark mode.
- Backgrounds: warm off-white light canvas and deep navy dark canvas.
- Surfaces: white/light slate and navy/slate panels.
- Text: deep slate in light mode and near-white in dark mode.
- Semantic colors: green for success, amber for offline/pending, red for destructive actions.
- Shapes: generous rounded cards, rounded controls, pill status indicators.
- Layout: fixed desktop sidebar, sticky top bar, centered content, bottom mobile navigation.

## Approved Clean SaaS direction

- Use a calm, precise product-interface aesthetic inspired by modern developer and operations tools.
- Prefer neutral surfaces, 1px borders, restrained radius, and almost-flat elevation.
- Keep violet as a controlled accent for focus, progress, active navigation, and the highest-priority action.
- Reduce oversized rounded cards and decorative blur; create hierarchy through spacing, typography, and borders.
- Use compact but comfortable information density so the dashboard feels capable rather than sparse.
- Replace text symbols with one consistent, understated outline-icon language during implementation.
- Preserve the familiar sidebar, top bar, dashboard sections, and mobile bottom navigation.

## Typography

- Primary family: `Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Use restrained weight contrast: 400/500 body, 600 controls, 650-700 headings, 700-750 key metrics.
- Use compact tracking for headings and large metrics; keep body copy neutral and highly legible.
- Avoid decorative, serif, or secondary display fonts.

## Component styling

- Cards: 14-16px radius, subtle neutral border, little or no ambient shadow.
- Buttons: 10px radius, 40-44px standard height, concise labels, clear primary/secondary hierarchy.
- Inputs: 10px radius, visible focus ring, neutral surface, 44px minimum height.
- Navigation: quiet default items, soft neutral hover, violet-tinted active state rather than a heavy black block.
- Metrics: strong tabular-feeling numbers, restrained captions, no decorative gradients.
- Status: compact dot plus text; never communicate state by color alone.

## Interaction and accessibility

- Maintain visible focus rings and minimum 42px interactive targets.
- Do not rely on color alone for connection or destructive states.
- Keep reduced visual noise, clear primary actions, and obvious hierarchy.
- Preserve responsive navigation and modal behavior.
- Keep motion subtle and functional; respect reduced-motion preferences in implementation.

## Design exploration boundary

The redesign may change spacing, density, hierarchy, surface treatment, icon treatment, and component
composition. It must use Geist and remain within the existing violet/neutral/semantic palette until
the user explicitly approves a different brand direction.
