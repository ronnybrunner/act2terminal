# act2terminal

Terminal UI (TUI) wizard that asks for a number (1..50) and generates an Actionplan checklist.

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

Start the wizard:

```bash
action
```

Exit anytime with: `ESC` / `q` / `Ctrl+C`.

On the output screen you can:

- Edit the current point in the editor (focus starts there); type and hit `Enter` to commit, or move with `Up/Down` and your edits carry over.
- Paste text into the editor with `Ctrl+V` or `Shift+Insert` (reads the system clipboard via clipboardy).
- `Copy` (`c` shortcut) copies the plain rendered plan with timestamp header to the system clipboard (clipboardy on Windows; OSC52 fallback otherwise).
- `Print stdout` (`p`) prints the plan after the UI closes (handy for piping).
- `Restart` (`r`) / `Exit`.

Notes:

- The header includes the generated time (`Actionplan (YYYY-MM-DD HH:mm)`) captured when the output screen opens; Copy/Print always use that exact text.
- On Windows, `clipboardy` uses native clipboard APIs and should work out of the box; OSC52 remains as fallback.

## Manual test

```bash
npm install
npm link
action
```

## Clipboard troubleshooting (Linux)

`clipboardy` typically needs a clipboard provider:

- Wayland: `wl-clipboard` (install `wl-copy` / `wl-paste`)
- X11: `xclip` or `xsel`

If that is missing (or you are on SSH), the app falls back to OSC52. Terminal support varies (tmux/screen may need config).
