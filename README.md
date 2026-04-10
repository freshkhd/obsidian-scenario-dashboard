# Obsidian Scenario Dashboard

[![CI – Lint](https://github.com/freshkhd/obsidian-scenario-dashboard/actions/workflows/lint.yml/badge.svg)](https://github.com/freshkhd/obsidian-scenario-dashboard/actions/workflows/lint.yml)
![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=7C3AED&label=downloads&query=%24%5B%22obsidian-scenario-dashboard%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)
![License](https://img.shields.io/badge/license-0--BSD-blue)

A **Scrivener-inspired kanban dashboard** for [Obsidian](https://obsidian.md) designed for writers, screenwriters, and storytellers. Manage your entire writing pipeline — from raw ideas to finished projects — without ever leaving your vault.

---

## ✨ Features

### Kanban Pipeline Board
- **Three-stage pipeline** out of the box: 💡 Ideas → 🗺️ Plot Development → 🎬 Project
- Add notes by typing a `[[wiki-link]]` or plain title and pressing **Enter**
- **Drag notes from the File Explorer** directly into any column
- **Reorder cards** within a column via drag-and-drop
- **Nest notes as sub-items** — drop a card onto the center of another to create a parent–child hierarchy
- Move cards between columns with drag-and-drop; duplicate detection prevents double entries

### Native Obsidian Integration
- **Hover preview** — hover over any linked note and press **Ctrl** (or **⌘** on macOS) to see a live popup preview, exactly like native wiki-links
- **Auto-rename sync** — rename a note in Obsidian and every kanban card and reference item updates automatically; no broken links

### Collapsible Reference Panel
- Slide-in **reference panel** on the right side of the dashboard (toggle with the 📂/📁 button)
- **Fully dynamic tabs** — create, rename, reorder, and delete tabs to match your project structure
  - **Add** a tab with the `+` button
  - **Rename** by double-clicking a tab label
  - **Delete** via the `×` button (with a confirmation dialog)
  - **Reorder** tabs by dragging them left or right
- Drag reference items directly onto kanban cards to add them as pipeline entries or sub-items
- Drag kanban cards into the reference panel to store them as reference material

---

## 📦 Installation

### Option A — BRAT (Recommended for beta users)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) lets you install plugins directly from GitHub without waiting for the community plugin store.

1. Install the **BRAT** plugin from the Obsidian Community Plugin directory.
2. Open **Settings → BRAT → Add Beta Plugin**.
3. Paste the repository URL:
   ```
   https://github.com/freshkhd/obsidian-scenario-dashboard
   ```
4. Click **Add Plugin** and enable it in **Settings → Community Plugins**.

### Option B — Manual Installation

1. Go to the [Releases](https://github.com/freshkhd/obsidian-scenario-dashboard/releases) page and download the latest:
   - `main.js`
   - `styles.css`
   - `manifest.json`
2. Copy all three files into your vault at:
   ```
   <YourVault>/.obsidian/plugins/obsidian-scenario-dashboard/
   ```
3. Reload Obsidian and enable **Scenario Dashboard** in **Settings → Community Plugins**.

---

## 🚀 Usage

| Action | How |
|---|---|
| Open the dashboard | Click the **grid icon** in the left ribbon, or run `Open dashboard` from the Command Palette |
| Add a note to a column | Type `[[Note Title]]` or just `Note Title` in the column's input field and press **Enter** |
| Drop a note from File Explorer | Drag any `.md` file from the File Explorer onto a column or card |
| Reorder cards | Drag a card up or down within its column |
| Nest a card as a sub-item | Drag a card and drop it onto the **center** of another card |
| Open a note | Click the note title link |
| Preview a note | Hover over the title, then press **Ctrl** / **⌘** |
| Open / close Reference Panel | Click the 📂 / 📁 toggle button on the right edge of the board |
| Add a reference tab | Click the `+` button in the tab bar |
| Rename a tab | Double-click the tab label |
| Delete a tab | Hover the tab → click `×` → confirm |
| Reorder tabs | Drag a tab left or right |

---

## 🛠 Development

### Prerequisites

- [Node.js](https://nodejs.org/) v16+
- [npm](https://www.npmjs.com/)

### Setup

```bash
git clone https://github.com/freshkhd/obsidian-scenario-dashboard.git
cd obsidian-scenario-dashboard
npm install
```

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Watch mode — auto-compile on file changes |
| `npm run build` | Type-check + production bundle |
| `npm run lint` | Run ESLint (enforces Obsidian plugin guidelines) |

### Project Structure

```
src/
├── main.ts              # Plugin entry point, settings load/save, rename sync
├── settings.ts          # Settings interface & defaults
├── types.ts             # Shared TypeScript interfaces
├── ui/
│   └── kanban-view.ts   # Main view — kanban board + reference panel
└── utils/
    └── constants.ts     # Column definitions, default tab list
```

### Contributing

Pull requests are welcome. Please make sure `npm run lint` passes before submitting.

---

## 📄 License

[0-BSD](LICENSE) — free to use, modify, and distribute with no restrictions.
