# Copilot Instructions for act2terminal

## Project Overview

**act2terminal** is a terminal UI (TUI) actionplan editor built with Node.js and the `blessed` library. It creates interactive checklists with status tracking (OPEN/IN_PROGRESS/DONE) that export to formatted text with customizable symbol presets. The entire application is a single monolithic file (`src/cli.js`, 1784 lines).

## Architecture & Core Design Patterns

### State Management
- **Single State Object**: All UI state lives in a normalized state object created by `normalizeState()` that includes:
  - `todos`: Array of `{text, done}` objects (max 50 items)
  - `activeIndex`: Currently selected item index
  - `inProgressIndex`: Only one item can be "in progress" at a time (null if none)
  - Configuration: `presetKey`, `headerStyleKey`, `wrapMode`, `wrapWidth`, `frameEnabled`, etc.
  - `isDirty`: Flag to mark unsaved changes

- **State Persistence**: Plans saved as JSON to `~/.act2terminal/actionplans/` (or `%APPDATA%/act2terminal/actionplans/` on Windows) with filename pattern `{ID}.json`. Use `serializeState()` and `normalizeState()` for serialization round-tripping.

### TUI Framework (blessed)
- **Screen/Widgets**: Uses `blessed.screen()` with custom widgets for the editor, output box, and settings overlay. Keybindings are attached via screen `keypress` events.
- **Rendering**: `refreshScreen()` is the central render hub; call it whenever state changes. It updates the output box with rendered plan text, status line, and help line.
- **Modal Overlay**: Settings menu (`screen.blessed.SettingsOverlay`) is a modal toggle; always returns focus to the main editor on close.

### Symbol Presets
- **PRESETS object** defines 8 symbol sets with properties:
  - `openToken`, `inProgressToken`, `doneToken`: The actual symbols (variable width)
  - `supportsBrackets`: If true, symbols wrap in `[...]`; if false, displayed as-is
  - Padding logic ensures tokens align in export (see `renderTodos()`)

- **Example**: `squares` is `[□] [■] [✓]`; `bullets` is `• ▸ ✓ ` (no brackets, multi-char tokens)

## Key Developer Workflows

### Running & Testing Locally
```bash
npm install           # Install blessed, clipboardy
npm link              # Register 'action' command globally
action                # Start the TUI
```

### Manual Test Checklist (from README)
- `F8` → `F10` sets DONE; `F9` clears it
- `F9` → `F10` clears DONE before IN_PROGRESS activates
- `F9` on item 2 moves IN_PROGRESS from item 1
- These interactions verify state exclusivity (only one in-progress at a time)

### Key Event Handlers (All in `main()`)
- **F2**: `insertTodoAfter()` (adds new item, 50-item limit)
- **F3**: Append `\n` to current todo (subpoint marker)
- **F4**: Copy checklist to clipboard via `clipboardy` (falls back to OSC52)
- **F5**: Print to stdout and exit
- **F6/F7**: Save/Load (not fully shown in excerpt; check full `src/cli.js`)
- **F8/F9/F10**: Toggle OPEN/IN_PROGRESS/DONE states
- **Enter**: Insert new todo after active
- **Backspace**: Delete last character from active todo text
- **Ctrl+V / Shift+Insert**: Paste from clipboard into active todo

## Project-Specific Conventions

### Rendering & Export Logic
- **Wrapping**: Three modes (`soft`, `hard`, `off`) configured globally. `soft` wraps at word boundary; `hard` wraps at pixel width. Subpoints (lines with `\n`) are indented per `wrapIndent` setting.
- **Framing**: Optional decorative box drawn around export via `FRAME_STYLES` object. Frame export mode (`same`, `ascii-only`, `off`, `markdown`) controls how symbols render in frames.
- **Timestamp in Header**: Generated on init, refreshable from settings menu. Format: `# Actionplan {ID} (YYYY-MM-DD HH:mm)`

### UI-Only vs Export Markers
- **UI-Only Elements**: Active line marker (`▸`), cursor (`▏`), empty-item placeholders are never exported
- **Export**: Only plain text with selected preset symbols and optional frame; Markdown headers use `# ` prefix if header style is `markdown`

### Clipboard Handling
- **Primary**: Uses `clipboardy` library
- **Fallback**: OSC52 sequence if `clipboardy` fails (supports modern terminals)
- **Paste**: `readClipboard()` reads system clipboard; failures are handled gracefully (status message shown, app doesn't crash)

### Configuration Schema
Saved plan files include a versioning field `updateVersion` and forward-compatibility via `coerce*()` functions that default unknown values to safe fallbacks. Always validate input via `normalizeState()` before using config values.

## Cross-Component Communication

### Main Data Flow
1. **Init**: Load plan from disk (or create new default) → `normalizeState()` → render
2. **User Input**: Key press → state mutation → `markDirty()` → `refreshScreen()`
3. **Export**: `renderTodos()` builds formatted string based on state config → copy/print/save
4. **Settings Change**: Menu selection → update state → `refreshScreen()`

### Critical Functions
- `renderTodos(state, exportMode)`: Builds the final export string with all formatting
- `changeActive(delta)`: Navigates active index with bounds checking
- `toggleActiveDone()`, `toggleInProgress()`: Mutate state directly, then refresh
- `savePlan(state)`, `loadPlan(id)`: Disk I/O (wrapped in try/catch)

## Testing & Debugging Notes

- **No automated tests**: Manual testing via the CLI is the standard
- **State Normalization**: Always pass raw data through `normalizeState()` to ensure valid state before rendering
- **Console Logging**: Avoid in production (blessed TUI captures stdout); use blessed's logging features or file output for debugging
- **Max Items**: Hard limit of 50 todos; the UI gracefully ignores "Enter" when at limit

## Dependencies
- **blessed** (v0.1.81): Terminal UI rendering, screen/widget management
- **clipboardy** (v4.0.0): Cross-platform clipboard access; requires a clipboard provider on Linux (wl-clipboard for Wayland, xclip/xsel for X11)

## Node.js Requirements
- Requires Node.js ≥ 18 (per `package.json` engines field)
