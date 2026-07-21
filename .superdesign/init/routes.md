# Routes and Views

The app is a single-page Vite application with no routing library. `src/main.ts` is the only runtime
entry. `src/features/shell/index.ts` maps URL hashes to four in-document sections and toggles each
section's `hidden` property.

| URL hash | View | Static shell | Dynamic renderer |
| --- | --- | --- | --- |
| `#view-dashboard` | Dashboard | `index.html#view-dashboard` | `src/features/dashboard/index.ts` |
| `#view-history` | History | `index.html#view-history` | `src/features/history/index.ts` |
| `#view-trackers` | Trackers | `index.html#view-trackers` | `src/features/trackers/index.ts` |
| `#view-settings` | Settings | `index.html#view-settings` | `src/features/settings/index.ts` |

The authentication screen is the initial root state at `index.html#authScreen`. After successful
authentication, `index.html#app` and `index.html#mobileNav` become visible. Tracker and log forms are
overlay modals rather than routes.

## Router configuration equivalent

There is no separate router configuration. The authoritative view type and metadata are:

```ts
export type ViewName = 'dashboard' | 'history' | 'trackers' | 'settings';

const PAGE_METADATA: Record<ViewName, PageMetadata> = {
  dashboard: {
    title: 'Your daily tracking',
    action: '+ Add tracker',
    actionType: 'tracker'
  },
  history: { title: 'History', action: '+ Add record', actionType: 'log' },
  trackers: { title: 'Manage trackers', action: '+ New tracker', actionType: 'tracker' },
  settings: { title: 'Settings', action: '', actionType: '' }
};
```

Navigation clicks and `hashchange` are handled in full by `src/features/shell/index.ts`, captured in
`layouts.md`.
