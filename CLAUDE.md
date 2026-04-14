# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build   # TypeScript type-check (tsc --noEmit) + esbuild production bundle
npm run dev     # esbuild watch mode (no type-check)
npm run lint    # eslint ./src/
```

Build output is `main.js` at the repo root. The plugin loads directly from this directory as it lives inside an Obsidian vault (`<vault>/.obsidian/plugins/obsidian-scenario-dashboard/`).

---

## Architecture

### View system

There is a **single registered Obsidian `ItemView`** — `DashboardView` (`src/ui/dashboard-view.ts`). Its view-type string is `'scenario-kanban-dashboard'` (constant `VIEW_TYPE_KANBAN` in `constants.ts`). This string must never change — Obsidian persists open leaves by type ID, so renaming it would silently break saved workspaces.

`DashboardView` renders two sub-views controlled by `plugin.settings.lastActiveView`:
- **`'story'`** — five-column kanban board + collapsible reference panel
- **`'gantt'`** — phase-grouped task list + horizontal timeline with progress bars

The render cycle is a **full DOM re-render**: every state change calls `this.renderBoard()` which does `contentEl.empty()` and rebuilds from scratch. There is no virtual DOM or incremental patching. Local UI state (which tab is active, which inline editor is open, etc.) is stored as class-private fields on `DashboardView`.

### Data flow

All persistent state lives in `plugin.settings: ScenarioPluginSettings`. Mutations always follow:
1. Mutate `plugin.settings.*` directly
2. `await plugin.saveSettings()` (writes to Obsidian's `data.json`)
3. `this.renderBoard()` (re-renders)

Settings changes triggered from `settings-tab.ts` call `plugin.refreshViews()` instead, which re-renders all open dashboard leaves.

### Single source of truth for columns and phases

- **Kanban columns**: `COLUMN_DEFS` array in `constants.ts`. All column rendering, settings inputs, and data iteration loop over this array — adding/removing a column only requires updating this array (plus `ColumnId` union in `types.ts` and `DEFAULT_KANBAN_DATA`).
- **Gantt phases**: `DEFAULT_GANTT_PHASES` in `constants.ts`. Runtime phases live in `plugin.settings.gantt.phases` (user-editable). Tasks are keyed by phase `id` in `plugin.settings.gantt.tasks`.

### Settings and migration

`src/main.ts:loadSettings()` is responsible for both default initialization and forward migration. Pattern:
```ts
if (!this.settings.someField) this.settings.someField = DEFAULT_VALUE;
```
Each new persistent field added to `ScenarioPluginSettings` **must** have a corresponding guard here so old saved data is upgraded on first load.

### Constants

`GANTT_SCALE_PX` maps `'daily' | 'weekly' | 'monthly'` to pixels-per-day. All timeline coordinate math derives from this single multiplier — changing zoom only requires updating `plugin.settings.ganttScale`.

### Styling

`styles.css` uses **Obsidian CSS variables exclusively** (`--background-primary`, `--interactive-accent`, `--color-green`, `--text-on-accent`, etc.) — no hardcoded hex colors. This ensures compatibility with all user themes. The gantt bar accent system maps `GanttAccent` (`'tertiary'` | `'secondary'` | `'muted'`) to `var(--color-green)`, `var(--color-orange)`, and `var(--text-faint)` respectively via utility classes `.gantt-accent-*` and `.gantt-bar-*`.

### File map

```
src/
  main.ts              Plugin lifecycle, view registration, rename-sync event, loadSettings migration
  settings.ts          ScenarioPluginSettings interface + DEFAULT_SETTINGS
  types.ts             All TypeScript types (KanbanItem, ColumnId, GanttTask, GanttPhase, …)
  utils/constants.ts   COLUMN_DEFS, DEFAULT_*, GANTT_SCALE_PX — single source of truth for defaults
  ui/
    dashboard-view.ts  DashboardView (ItemView): nav panel + Story view + Gantt view (~1000 lines)
    settings-tab.ts    ScenarioSettingTab: column labels, ref panel title, gantt phase management
```
