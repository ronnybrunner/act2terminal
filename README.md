# act2terminal

Terminal UI (TUI) Actionplan editor that starts immediately, with a tab settings menu for count, presets, and clipboard export.

## Install

```bash
npm install
```

## Local link (recommended for dev)

```bash
npm link
action
```

## Usage

Start the editor:

```bash
action
```

Start state:

- The editor opens immediately with the default count (2 items).
- All items start as OPEN, `in progress` is unset.
- Typing edits the active entry inline.

Settings menu (TAB):

- `Tab`: Open/close the settings overlay.
- `Up/Down`: Move selection.
- `Left/Right`: Change the count when on “Anzahl Punkte”.
- `Enter`: Select a preset, header style, or refresh the timestamp.
- `ESC` / `Tab`: Close and return to the editor.

Editor screen:

- Header shows the timestamp from app start (refreshable from the menu).
- Output box renders the Actionplan document with the current symbols.
- Active line has a `▸` marker + inverse highlight (UI only, never in export).
- Active line shows a cursor indicator `▏` at the end (UI only).
- Empty items show a placeholder only in the UI.

Symbol presets (OPEN / IN_PROGRESS / DONE):

- Squares: `[□] [■] [✓]`
- Markdown: `[ ] [~] [x]`
- Arrows: `[ ] [>] [✓]`
- Minimal: `[ ] [*] [✓]`
- Pipe Tree: `[| ] [|> ] [| ✓ ]`
- ASCII Branch: `[|- ] [|> ] [|✓ ]`
- Bullets: `[• ] [▸ ] [✓ ]`
- Box Drawing: `[│ ] [│▶ ] [│✓ ]`

Tokens are padded to the preset max width so the UI and export align.

Keybindings:

- `Tab`: Open/close settings menu.
- `Enter`: Move to the next item (adds a new item at the end up to 50).
- `Up/Down` or `j/k`: Change active item.
- `F8`: Set OPEN for the active item.
- `F9`: Toggle "in progress" for the active item (only one at a time).
- `F10`: Toggle DONE for the active item.
- `F4`: Copy the plain checklist to the system clipboard (CRLF on Windows); OSC52 fallback on failure.
- `F5`: Print the plain checklist to stdout and exit.
- `Ctrl+V` / `Shift+Insert`: Paste clipboard text into the active item.
- Exit anytime: `ESC` (also `q` / `Ctrl+C`).

Clipboard note:

- On Windows, `clipboardy` uses the native clipboard. If it fails, OSC52 is used as a fallback (terminal support required).

## Manual test

```bash
npm install
npm link
action
```

Manual checks:

- `F10` sets DONE on item 1 (DONE token visible).
- `F9` sets IN_PROGRESS on item 1 (DONE clears).
- `F8` sets OPEN on item 1.
- `F10` toggles DONE off on item 1.
- `F9` on item 2 moves IN_PROGRESS to item 2.

## Clipboard troubleshooting (Linux)

`clipboardy` typically needs a clipboard provider:

- Wayland: `wl-clipboard` (install `wl-copy` / `wl-paste`)
- X11: `xclip` or `xsel`

If that is missing (or you are on SSH), the app falls back to OSC52. Terminal support varies (tmux/screen may need config).
