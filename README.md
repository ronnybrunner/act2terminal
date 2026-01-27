# act2terminal

Terminal UI (TUI) wizard that asks for a number (1..50) and opens a Todo-checklist editor with clipboard export.

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

Flow:

1. Wizard Step 1: enter the number of todos (1..50).
2. The editor opens immediately with that many entries.

Editor screen (checklist style):

- Header: `# Todos (YYYY-MM-DD HH:mm)` with the timestamp frozen when the editor opens.
- Checklist lines: `[□]` / `[✓]` / `[■]` with an active marker `▸` and inverse highlight for the selected line. `[✓]` wins over `[■]` when both would apply.
- Empty todos show a placeholder in the UI only (`<enter todo…>`); exports never include the placeholder and keep empty lines as `[□]`.

Keybindings:

- `Enter`: Save the current editor text.
- `Up/Down` or `j/k`: Change active todo (current text is saved first).
- `F9`: Toggle "in progress" for the active todo (`[■]`), only one entry at a time.
- `F10`: Toggle done for the active todo (`[✓]`).
- `F4`: Copy the plain checklist (no UI tags/marker) to the system clipboard; OSC52 fallback on failure.
- `F5`: Print the plain checklist to stdout and exit.
- `Ctrl+V` / `Shift+Insert`: Paste clipboard text into the editor.
- `r`: Restart the wizard.
- Exit anytime: `ESC` / `q` / `Ctrl+C`.

Clipboard note:

- On Windows, `clipboardy` uses the native clipboard. If it fails, OSC52 is used as a fallback (terminal support required).

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
