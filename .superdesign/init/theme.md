# Theme and Design Tokens

Source of truth: `src/styles/app.css` (the complete file must be passed directly to every Superdesign
draft command).

## Framework

- Styling approach: custom global CSS, no Tailwind, CSS Modules, or CSS-in-JS.
- Responsive strategy: mobile-first at 640px, 760px, 900px, and 1200px.
- Theme strategy: CSS custom properties on `:root` and `html[data-theme=dark]`.
- Font stack: currently Inter with system fallbacks; the approved redesign requirement is Geist.

## Complete token definitions

```css
:root {
  --bg: #f5f4ef;
  --panel: #fff;
  --panel-2: #f8fafc;
  --text: #172033;
  --muted: #64748b;
  --subtle: #94a3b8;
  --line: #e2e8f0;
  --brand: #6d4aff;
  --brand-2: #ede9fe;
  --dark: #111827;
  --danger: #dc2626;
  --success: #15803d;
  --shadow: 0 18px 45px rgba(15, 23, 42, .08);
  --radius-lg: 28px;
  --radius-md: 18px;
  color-scheme: light;
}

html[data-theme=dark] {
  --bg: #0b1120;
  --panel: #111827;
  --panel-2: #172033;
  --text: #f8fafc;
  --muted: #a7b0c0;
  --subtle: #7c879a;
  --line: #263247;
  --brand: #9b87ff;
  --brand-2: #2d2554;
  --dark: #f8fafc;
  --danger: #fb7185;
  --success: #4ade80;
  --shadow: 0 18px 45px rgba(0, 0, 0, .22);
  color-scheme: dark;
}
```

## Typography

- Body: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Page titles use `clamp(22px, 4vw, 30px)` and tight negative tracking.
- Stat values use 30-38px, weight 850, and tight negative tracking.
- Labels and supporting copy range from 10-13px with weights 700-800.

## Shape and elevation

- Main cards: 28px radius and subtle large shadow.
- Controls: 10-14px radius; modals: 26px radius.
- Status elements and toasts: pill radius.
- Borders use the theme `--line` token and translucent `color-mix` variants.

## Layout

- Desktop sidebar: fixed 252px wide from 900px.
- Main content: max-width 1180px.
- Mobile bottom navigation: four equal columns with safe-area padding.
- Tracker grids: one column by default, two from 900px, optional three from 1200px.
- Settings: one column by default, two from 640px.
- Modals: bottom sheet on mobile and centered 560px dialog from 640px.

## Motion

- View entrance: 180ms fade and 4px translate.
- Buttons: active scale to .985.
- Progress, toggle, and toast transitions: 180-250ms.
- Smooth document scrolling is enabled.

## Complete implementation

The stylesheet is intentionally retained as the authoritative full implementation rather than
duplicated in a second editable copy. Always use `--context-file src/styles/app.css` so Superdesign
receives every selector and responsive rule without drift.
