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

- `Copy` to system clipboard (clipboardy)
- fallback: emits OSC52 escape sequence when clipboard is unavailable
- `Print stdout` (prints the plan after the UI closes; handy for piping)
- `Restart` / `Exit`

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
