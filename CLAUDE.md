# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read AI_CONTEXT first

Before making any non-trivial change, read the relevant file(s) in `AI_CONTEXT/` in full — not just the presumably relevant section. This directory is the project's binding knowledge base of already-settled architecture, design-system, and workflow decisions (written so AI models don't have to re-derive them from source each session). Treat what it documents as binding, not as suggestions.

- `AI_CONTEXT/README.md` — how to use the knowledge base, recommended reading order
- `00_PROJECT_STATUS.md` — current state, in-progress areas, known rough edges
- `01_PROJECT_PHILOSOPHY.md` — local-first, single-user, no cloud requirement, minimalism
- `02_DESIGN_GUIDELINES.md` / `14_DESIGNSYSTEM.md` — binding visual design system (colors, radii, transitions, dialogs, context menus)
- `03_PROGRAMMING_RULES.md` — binding architecture/coding rules (see below)
- `04_RELEASE_WORKFLOW.md` — the **only** valid release procedure; triggered verbatim by phrases like "Tag beenden" / "Release" / "Leg los" — follow it exactly, no clarifying questions
- `05_DELIVERY_STANDARD.md` — how finished work is handed off
- `06`–`11` — final concept per feature area (Dashboard, Sidebar, Editor, Settings, Search, Backup)
- `12_KNOWN_DECISIONS.md` — condensed lookup of all decisions across the app
- `13_ROADMAP.md` — actually-committed future work (currently empty)
- `15_HUMAN_INTERFACE.md` — interaction/accessibility details

After completing a major area of work, update the matching `AI_CONTEXT` file(s) with the new final state (not the path taken there).

## Commands

```bash
npm install          # install dependencies
npm run dev           # run the app (electron . --dev)
npm start              # run the app (electron .)
npm run build:vendor    # rebuild renderer/js/vendor/*.js from build/editor-entry.js and build/search-entry.js via esbuild
npm run dist            # build the Linux AppImage into dist/
npm run release          # build and publish a draft GitHub release (electron-builder --publish always)
```

There is no lint or test suite in this project. "Verification" for this project means running the app and exercising the change in a real running instance (see `03_PROGRAMMING_RULES.md`).

**Nach jeder Code-Änderung immer explizit angeben, was in der Konsole einzugeben ist, um sie zu testen — vollständig und in der richtigen Reihenfolge:**
1. Falls `package.json` sich geändert hat oder `node_modules` fehlt: `npm install`
2. Der eigentliche Startbefehl zum Testen: `npm run dev -- --user-data-dir=$HOME/.archiv-wiki-dev-settings`

Diese Angabe erfolgt immer, auch wenn nur Schritt 2 nötig ist — die grafische Oberfläche kann nicht selbst eingesehen werden, der Nutzer muss jedes Mal wissen, was er selbst eingeben muss, um es zu sehen.

**Nach jeder bestätigten, gewollten Code-Änderung wird direkt gefragt, ob sie jetzt committet werden soll** (mit einem passenden Commit-Text), statt sie unkommittiert im Arbeitsverzeichnis liegen zu lassen. Reine Test-Änderungen, die nur zur Prüfung einer Regel dienten, werden stattdessen ausdrücklich als „nur zum Testen, nicht committen" gekennzeichnet.

**Zu Beginn jeder Sitzung zuerst `git status` prüfen** und kurz zusammenfassen, was bereits offen/unkommittet vorliegt, bevor eine neue Aufgabe begonnen wird.

**Any change to `build/editor-entry.js` or `build/search-entry.js` requires `npm run build:vendor` before it takes effect** — the resulting bundles in `renderer/js/vendor/` are committed and shipped as-is; an unrebuilt change is not applied.

## Architecture

Electron app with the standard three-layer split — **never bypassed**:

- **Main process** (`main.js` + `main/*.js`) — window/menu/tray, app lifecycle, and all filesystem/OS access. Each concern lives in its own module and registers its own IPC handlers: `app-state.js` (persisted app-wide state), `atomic-write.js` (shared atomic write helper), `backup.js` (auto/manual ZIP backups), `notes-fs.js` + `filesystem-ipc.js` (note/category CRUD on disk), `export-ipc.js` (PDF/HTML/MD/ZIP export), `sync-ipc.js` + `sync-classify.js` (WebDAV sync), `settings-ipc.js` (project config read/write), `wizard-ipc.js` (first-run setup), `project.js` (project validation/config read).
- **Preload** (`preload.js`) — the only bridge between renderer and main, via `contextBridge.exposeInMainWorld('archivAPI', …)`. Runs with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` — this security model is never weakened, not even temporarily.
- **Renderer** (`renderer/`) — plain HTML/CSS/JS, no framework. `renderer/js/app.js` is the large main controller (sidebar, dashboard, context menus, dialogs wiring); `editor.js`, `search.js`, `settings-window.js`, `dialog.js`, `theme.js`, `icon-library.js`, `wizard.js` etc. are focused modules. `renderer/js/vendor/` holds prebuilt bundles (CodeMirror, marked, highlight.js, KaTeX, FlexSearch) produced by `build/build.mjs` from `build/editor-entry.js` / `build/search-entry.js` — esbuild is the only bundler, no webpack/Vite.

IPC channels follow the naming scheme `<area>:<action>` (e.g. `settings:update`, `export:projectZip`, `sync:getSettings`). New renderer-facing capability that needs filesystem/OS access is added as a new IPC channel through `preload.js`, never as direct Node access in the renderer.

### Data model

- A "project" is a plain folder containing `.wiki-config.json`, `.wiki-trash/`, `.attachments/`, and category subfolders.
- Exactly two levels of hierarchy: main category → subcategory → note. No deeper nesting, no notes directly under a main category.
- Notes are `.md` files with YAML frontmatter (`title`, `tags`, `category`, `mainCategory`, `created`, `modified`), parsed with `gray-matter`.
- Attachments live project-wide in one `.attachments/` folder (not per note/category); referenced via `attachment:<filename>`, resolved to a `file://` URL.
- Trash is flat (`.wiki-trash/`), no mirrored folder structure.
- Project settings live only in `.wiki-config.json`, updated via deep-merge; always read live from that single source, never from a cached copy.
- Symlinks are deliberately skipped (not followed) when reading notes or building the search index.

### Cross-cutting rules worth knowing before editing

- **Atomic writes**: notes, `.wiki-config.json`, `app-state.json`, sync manifest/credentials, and WebDAV downloads all go through `main/atomic-write.js` (temp file in the same folder → fsync → atomic rename). Never overwrite these directly with `writeFile`/`writeFileSync`.
- **One search mechanism only**: the sidebar search box searches the entire wiki (title/body/tags/category) via an in-memory FlexSearch index that is fully rebuilt after any data change — there is deliberately no second, parallel filter/search path. The editor's own find-in-note (CodeMirror) is a separate, intentionally distinct mechanism.
- **Design system tokens only**: colors, radii, transition timings, fonts come from the CSS variables in `renderer/css/styles.css` — never introduce new hardcoded values. Standard transition is `150ms ease`; three radius steps only (4/6/8px); hover is a color change only (no lift+shadow).
- **Dialogs & context menus**: all modal HTML dialogs share the accessibility/focus-trap logic in `renderer/js/dialog.js`; all custom HTML context menus share `manageHtmlContextMenu()` in `renderer/js/app.js`. Don't build a parallel local implementation of either.
- **No duplicate logic**: before adding a function, check whether an existing one in the relevant module already does it — shared logic (path building, formatting, validation) lives in exactly one place.
- **No quick fixes**: fix the structural cause; if a class of elements shares a bug, fix the shared rule rather than patching each instance.
