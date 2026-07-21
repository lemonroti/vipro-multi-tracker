# Extractable Components

The source is vanilla HTML/TypeScript, so extraction should translate the listed markup to
Petite-Vue templates. Preserve labels, current symbols, and structure unless a later approved design
explicitly replaces them.

## SidebarNavigation

- Source: `index.html` and `src/features/shell/index.ts`
- Category: layout
- Description: Fixed desktop sidebar with brand, four navigation destinations, and cloud status.
- Extractable props: `activeItem` (string, default `dashboard`), `isOnline` (boolean, default `true`), `pendingCount` (number, default `0`)
- Hardcoded: MT brand mark, navigation labels, navigation symbols, layout classes

## TopBar

- Source: `index.html` and `src/features/shell/index.ts`
- Category: layout
- Description: Sticky page header with greeting, page title, sync badge, and contextual primary action.
- Extractable props: `activeItem` (string, default `dashboard`), `isOnline` (boolean, default `true`), `pendingCount` (number, default `0`)
- Hardcoded: page metadata, action labels, layout classes

## MobileNavigation

- Source: `index.html` and `src/features/shell/index.ts`
- Category: layout
- Description: Fixed four-destination bottom navigation shown below the desktop breakpoint.
- Extractable props: `activeItem` (string, default `dashboard`)
- Hardcoded: labels, symbols, navigation order, layout classes

## SyncStatusCard

- Source: `index.html` and `src/features/shell/index.ts`
- Category: basic
- Description: Sidebar status panel communicating synced, pending, or offline state.
- Extractable props: `isOnline` (boolean, default `true`), `pendingCount` (number, default `0`), `isSyncing` (boolean, default `false`)
- Hardcoded: status-dot styling and explanatory copy patterns

## TrackerCard

- Source: `src/features/dashboard/index.ts`
- Category: basic
- Description: Daily tracker summary with icon, total, goal progress, and quick-record actions.
- Extractable props: none for shared layout extraction
- Hardcoded: structure and CSS classes; tracker values are page data

## ActivityRow

- Source: `src/features/dashboard/index.ts` and `src/features/history/index.ts`
- Category: basic
- Description: Compact record row with tracker identity, timestamp/note, and value.
- Extractable props: none for shared layout extraction
- Hardcoded: structure and CSS classes; record values are page data

## ModalShell

- Source: `index.html` and `src/features/shell/index.ts`
- Category: layout
- Description: Responsive bottom-sheet/mobile and centered/desktop dialog frame.
- Extractable props: `isExpanded` (boolean, default `true`)
- Hardcoded: backdrop, close action, header layout, and responsive behavior
