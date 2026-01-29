# Tile Architecture (Dashboard Modules)

Tiles are small, self-contained UI + logic units intended to be composed on the dashboard grid. Each tile:

- Lives under `src/components/Tile/<TileName>.tsx`
- Exports a React component (named + default) and keeps internal styling + minimal state
- Consumes shared cross-tile state via lightweight stores (e.g. Zustand) instead of prop drilling
- Avoids side-effects on mount unless explicitly required (prefer event / action triggers)

## Principles
1. **Isolation** – A tile renders independently; missing data should degrade gracefully.
2. **Composability** – A tile returns a single root element with predictable sizing.
3. **Observability** – User actions emit structured events (future telemetry hook).
4. **Theming** – Tailwind utilities only—avoid arbitrary inline colors unless dynamic.
5. **Accessibility** – Semantic elements, focus states, ARIA where appropriate.

## Anatomy Example: `ConsciousnessCore`
```
src/components/Tile/ConsciousnessCore.tsx
  - Visual status indicator (online/offline/booting)
  - Action button logging interaction
  - Reads `coreStatus` from `useDashboardStore`
```

## Creating a New Tile
1. Duplicate `ConsciousnessCore.tsx` → `YourTileName.tsx`
2. Adjust props, semantics, and internal logic
3. Import into `app/page.tsx` (or future grid layout)
4. (Optional) Extend `src/store/dashboardStore.ts`

## Shared State (Zustand)
`src/store/dashboardStore.ts` provides lightweight reactive state (metrics, statuses). Prefer flat primitives/arrays; add memoized selectors only if necessary.

## Future Enhancements
- Drag/responsive grid layout
- Telemetry + instrumentation boundaries
- Async hydration (SSE/WebSocket)
- Role/permission-based visibility
- Error boundary wrapping per tile

---
For proposals, open an issue referencing this document.
