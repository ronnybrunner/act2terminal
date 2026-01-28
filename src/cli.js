#!/usr/bin/env node
'use strict';

const blessed = require('blessed');

const DEFAULT_COUNT = 2;
const DEFAULT_PRESET = 'squares';
const DEFAULT_HEADER_STYLE = 'markdown';

const PRESETS = {
  squares: { label: 'Squares', openToken: '□', inProgressToken: '■', doneToken: '✓' },
  markdown: { label: 'Markdown', openToken: ' ', inProgressToken: '~', doneToken: 'x' },
  arrows: { label: 'Arrows', openToken: ' ', inProgressToken: '>', doneToken: '✓' },
  minimal: { label: 'Minimal', openToken: ' ', inProgressToken: '*', doneToken: '✓' },
  pipeTree: { label: 'Pipe Tree', openToken: '| ', inProgressToken: '|> ', doneToken: '| ✓ ' },
  asciiBranch: { label: 'ASCII Branch', openToken: '|- ', inProgressToken: '|> ', doneToken: '|✓ ' },
  bullets: { label: 'Bullets', openToken: '• ', inProgressToken: '▸ ', doneToken: '✓ ' },
  boxDrawing: { label: 'Box Drawing', openToken: '│ ', inProgressToken: '│▶ ', doneToken: '│✓ ' },
};

const HEADER_STYLES = {
  markdown: { label: '# Actionplan (YYYY-MM-DD HH:mm)', prefix: '# Actionplan' },
  plain: { label: 'Actionplan (YYYY-MM-DD HH:mm)', prefix: 'Actionplan' },
};

const HELP_LINE = 'Tab=Menu, F4=Copy, F5=Print, ↑↓=Select, Enter=Next, F8=Open, F9=In progress, F10=Done, ESC/Ctrl+C/Ctrl+Q=Exit';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pad(num) {
  return num.toString().padStart(2, '0');
}

function formatDate(generatedAt) {
  const year = generatedAt.getFullYear();
  const month = pad(generatedAt.getMonth() + 1);
  const day = pad(generatedAt.getDate());
  const hours = pad(generatedAt.getHours());
  const minutes = pad(generatedAt.getMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function initState() {
  return {
    todos: Array.from({ length: DEFAULT_COUNT }, () => ({ text: '', done: false })),
    activeIndex: 0,
    inProgressIndex: null,
    generatedAt: new Date(),
    presetKey: DEFAULT_PRESET,
    headerStyleKey: DEFAULT_HEADER_STYLE,
  };
}

function buildHeader(state) {
  const style = HEADER_STYLES[state.headerStyleKey] || HEADER_STYLES.markdown;
  return `${style.prefix} (${formatDate(state.generatedAt)})`;
}

function getPreset(state) {
  return PRESETS[state.presetKey] || PRESETS.squares;
}

function getPaddedTokens(preset) {
  const width = Math.max(
    preset.openToken.length,
    preset.inProgressToken.length,
    preset.doneToken.length,
  );
  return {
    openToken: preset.openToken.padEnd(width, ' '),
    inProgressToken: preset.inProgressToken.padEnd(width, ' '),
    doneToken: preset.doneToken.padEnd(width, ' '),
  };
}

function getToken(state, tokens, idx) {
  const todo = state.todos[idx];
  if (todo.done) return tokens.doneToken;
  if (state.inProgressIndex === idx) return tokens.inProgressToken;
  return tokens.openToken;
}

function renderPlain(state) {
  const header = buildHeader(state);
  const tokens = getPaddedTokens(getPreset(state));
  const lines = state.todos.map((todo, idx) => {
    const token = getToken(state, tokens, idx);
    const text = todo.text ? todo.text : '';
    return `[${token}] ${text}`;
  });
  return [header, '', ...lines].join('\n');
}

function renderScreen(state) {
  const header = buildHeader(state);
  const tokens = getPaddedTokens(getPreset(state));
  const lines = state.todos.map((todo, idx) => {
    const token = getToken(state, tokens, idx);
    const hasText = Boolean(todo.text && todo.text.trim() !== '');
    const text = hasText ? todo.text : '{gray-fg}<type todo...>{/gray-fg}';
    const cursor = idx === state.activeIndex ? '▏' : '';
    const uiText = cursor ? `${text}${cursor}` : text;
    const marker = idx === state.activeIndex ? '▸' : ' ';
    const line = `${marker} [${token}] ${uiText}`;
    return idx === state.activeIndex ? `{inverse}${line}{/inverse}` : line;
  });
  return [header, ...lines].join('\n');
}

function applyCount(state, newN) {
  const clamped = clamp(newN, 1, 50);
  const current = state.todos.length;
  if (clamped === current) {
    return { changed: false, trimmed: false, count: clamped };
  }

  if (clamped > current) {
    for (let i = current; i < clamped; i += 1) {
      state.todos.push({ text: '', done: false });
    }
  } else {
    state.todos = state.todos.slice(0, clamped);
  }

  if (state.activeIndex >= clamped) {
    state.activeIndex = Math.max(0, clamped - 1);
  }
  if (state.inProgressIndex !== null && state.inProgressIndex >= clamped) {
    state.inProgressIndex = null;
  }

  return { changed: true, trimmed: clamped < current, count: clamped };
}

function applyPreset(state, presetKey) {
  if (!PRESETS[presetKey] || state.presetKey === presetKey) return false;
  state.presetKey = presetKey;
  return true;
}

function osc52Copy(text) {
  const b64 = Buffer.from(text, 'utf8').toString('base64');
  process.stdout.write(`\u001b]52;c;${b64}\u0007`);
}

let clipboardyPromise;

async function loadClipboardy() {
  if (!clipboardyPromise) {
    clipboardyPromise = import('clipboardy').then((mod) => mod.default || mod);
  }
  return clipboardyPromise;
}

async function writeClipboard(text) {
  try {
    const clipboardy = await loadClipboardy();
    await clipboardy.write(text);
    return { ok: true, mode: 'clipboardy' };
  } catch (err) {
    return { ok: false, err };
  }
}

async function readClipboard() {
  try {
    const clipboardy = await loadClipboardy();
    const text = await clipboardy.read();
    return { ok: true, text };
  } catch (err) {
    return { ok: false, err };
  }
}

function main() {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'Actionplan',
    fullUnicode: true,
    dockBorders: true,
    mouse: true,
  });

  const state = initState();

  blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    height: 1,
    width: '100%',
    content: ` ${HELP_LINE}`,
  });

  const mainBox = blessed.box({
    parent: screen,
    top: 1,
    left: 'center',
    width: '90%',
    height: '100%-2',
  });

  const outputBox = blessed.box({
    parent: mainBox,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    border: 'line',
    scrollable: true,
    alwaysScroll: true,
    keys: false,
    mouse: true,
    tags: true,
    scrollbar: { ch: ' ', inverse: true },
  });

  const status = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    height: 1,
    width: '100%',
    tags: true,
    content: ' Ready.',
  });

  let menuBox;
  let menuOpen = false;
  let menuSelection = 0;

  function setStatus(msg) {
    status.setContent(` ${msg}`);
  }

  function formatStatusLine() {
    const progress = state.inProgressIndex !== null ? state.inProgressIndex + 1 : '-';
    const preset = getPreset(state);
    return `Active: ${state.activeIndex + 1}/${state.todos.length}, In progress: ${progress}, Preset: ${preset.label}`;
  }

  function ensureActiveVisible() {
    const lineIndex = state.activeIndex + 1;
    if (typeof outputBox.scrollTo === 'function') {
      outputBox.scrollTo(lineIndex);
    } else if (typeof outputBox.setScroll === 'function') {
      outputBox.setScroll(lineIndex);
    }
  }

  function refreshScreen(message) {
    outputBox.setContent(renderScreen(state));
    ensureActiveVisible();
    if (message) {
      setStatus(message);
    } else {
      setStatus(formatStatusLine());
    }
    screen.render();
  }

  function exit() {
    screen.destroy();
    process.exit(0);
  }

  function changeActive(delta) {
    const next = clamp(state.activeIndex + delta, 0, state.todos.length - 1);
    if (next !== state.activeIndex) {
      state.activeIndex = next;
      refreshScreen();
    } else {
      refreshScreen();
    }
  }

  function setActiveOpen() {
    const todo = state.todos[state.activeIndex];
    todo.done = false;
    if (state.inProgressIndex === state.activeIndex) {
      state.inProgressIndex = null;
    }
    refreshScreen(`Set OPEN: ${state.activeIndex + 1}`);
  }

  function toggleInProgress() {
    if (state.inProgressIndex === state.activeIndex) {
      state.inProgressIndex = null;
      refreshScreen(`Cleared IN_PROGRESS: ${state.activeIndex + 1}`);
      return;
    }
    state.inProgressIndex = state.activeIndex;
    state.todos[state.activeIndex].done = false;
    refreshScreen(`Set IN_PROGRESS: ${state.activeIndex + 1}`);
  }

  function toggleActiveDone() {
    const todo = state.todos[state.activeIndex];
    todo.done = !todo.done;
    if (todo.done) {
      if (state.inProgressIndex === state.activeIndex) {
        state.inProgressIndex = null;
      }
      refreshScreen(`Set DONE: ${state.activeIndex + 1}`);
      return;
    }
    refreshScreen(`Cleared DONE: ${state.activeIndex + 1}`);
  }

  async function copyTodos() {
    const plain = renderPlain(state);
    const plainForClipboard = plain.replace(/\n/g, '\r\n');
    const res = await writeClipboard(plainForClipboard);
    if (res.ok) {
      setStatus('Copied ✓ (F4)');
    } else {
      osc52Copy(plain);
      setStatus('Clipboard failed → OSC52 ✓');
    }
    screen.render();
  }

  function printTodos() {
    const plain = renderPlain(state);
    screen.destroy();
    process.stdout.write(`${plain}\n`);
    process.exit(0);
  }

  function getMenuLayout() {
    return [
      { type: 'count', selectable: true },
      { type: 'spacer' },
      { type: 'section', text: 'Symbol Presets' },
      ...Object.keys(PRESETS).map((key) => ({ type: 'preset', key, selectable: true })),
      { type: 'spacer' },
      { type: 'section', text: 'Header Style' },
      { type: 'header', key: 'markdown', selectable: true },
      { type: 'header', key: 'plain', selectable: true },
      { type: 'spacer' },
      { type: 'action', id: 'refresh', label: 'Refresh timestamp', selectable: true },
    ];
  }

  function getSelectableCount(layout) {
    return layout.filter((item) => item.selectable).length;
  }

  function getSelectedItem(layout) {
    let idx = -1;
    for (const item of layout) {
      if (!item.selectable) continue;
      idx += 1;
      if (idx === menuSelection) return item;
    }
    return null;
  }

  function renderMenu() {
    if (!menuBox) return;
    const layout = getMenuLayout();
    menuSelection = clamp(menuSelection, 0, Math.max(0, getSelectableCount(layout) - 1));
    let selectableIndex = -1;
    const lines = layout.map((item) => {
      if (item.type === 'spacer') return '';
      if (item.type === 'section') return `{bold}${item.text}{/bold}`;
      if (item.selectable) selectableIndex += 1;
      const isSelected = item.selectable && selectableIndex === menuSelection;

      let line = '';
      if (item.type === 'count') {
        line = `Anzahl Punkte: ${state.todos.length} (←/→)`;
      } else if (item.type === 'preset') {
        const preset = PRESETS[item.key];
        const radio = state.presetKey === item.key ? '(x)' : '( )';
        line = `${radio} ${preset.label} [${preset.openToken}] [${preset.inProgressToken}] [${preset.doneToken}]`;
      } else if (item.type === 'header') {
        const style = HEADER_STYLES[item.key];
        const radio = state.headerStyleKey === item.key ? '(x)' : '( )';
        line = `${radio} ${style.label}`;
      } else if (item.type === 'action') {
        line = item.label;
      }

      return isSelected ? `{inverse}${line}{/inverse}` : line;
    });

    menuBox.setContent(lines.join('\n'));
    screen.render();
  }

  function buildMenu() {
    menuBox = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '70%',
      height: '70%',
      border: 'line',
      label: ' Settings ',
      tags: true,
      keys: true,
      mouse: true,
      hidden: true,
    });
  }

  function openMenu() {
    if (!menuBox) buildMenu();
    menuOpen = true;
    menuSelection = 0;
    menuBox.show();
    menuBox.focus();
    renderMenu();
    setStatus('Menu');
    screen.render();
  }

  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    if (menuBox) menuBox.hide();
    refreshScreen();
  }

  function moveMenuSelection(delta) {
    if (!menuOpen) return;
    const layout = getMenuLayout();
    const count = getSelectableCount(layout);
    menuSelection = clamp(menuSelection + delta, 0, Math.max(0, count - 1));
    renderMenu();
  }

  function handleMenuCount(delta) {
    if (!menuOpen) return;
    const layout = getMenuLayout();
    const selected = getSelectedItem(layout);
    if (!selected || selected.type !== 'count') return;
    const result = applyCount(state, state.todos.length + delta);
    if (result.changed) {
      const message = result.trimmed ? `Trimmed to ${result.count}` : `Count: ${result.count}`;
      refreshScreen(message);
    }
    renderMenu();
  }

  function handleMenuEnter() {
    if (!menuOpen) return;
    const layout = getMenuLayout();
    const selected = getSelectedItem(layout);
    if (!selected) return;

    if (selected.type === 'preset') {
      if (applyPreset(state, selected.key)) {
        refreshScreen(`Preset: ${PRESETS[selected.key].label}`);
      }
      renderMenu();
      return;
    }

    if (selected.type === 'header') {
      if (HEADER_STYLES[selected.key]) {
        state.headerStyleKey = selected.key;
        refreshScreen('Header style updated');
      }
      renderMenu();
      return;
    }

    if (selected.type === 'action' && selected.id === 'refresh') {
      state.generatedAt = new Date();
      refreshScreen('Timestamp refreshed');
      renderMenu();
    }
  }

  screen.on('keypress', async (ch, key) => {
    if (key && ((key.ctrl && key.name === 'c') || ((key.ctrl || key.meta) && key.name === 'q'))) {
      exit();
      return;
    }

    if (key && key.name === 'tab') {
      if (menuOpen) {
        closeMenu();
      } else {
        openMenu();
      }
      return;
    }

    if (menuOpen) {
      if (!key) return;
      if (key.name === 'escape') {
        closeMenu();
        return;
      }
      if (key.name === 'up' || ((key.meta || key.ctrl) && key.name === 'k')) {
        moveMenuSelection(-1);
        return;
      }
      if (key.name === 'down' || ((key.meta || key.ctrl) && key.name === 'j')) {
        moveMenuSelection(1);
        return;
      }
      if (key.name === 'left') {
        handleMenuCount(-1);
        return;
      }
      if (key.name === 'right') {
        handleMenuCount(1);
        return;
      }
      if (key.name === 'enter') {
        handleMenuEnter();
        return;
      }
      return;
    }

    if (key && key.name === 'escape') {
      exit();
      return;
    }

    if (key && (key.name === 'up' || ((key.meta || key.ctrl) && key.name === 'k'))) {
      changeActive(-1);
      return;
    }

    if (key && (key.name === 'down' || ((key.meta || key.ctrl) && key.name === 'j'))) {
      changeActive(1);
      return;
    }

    if (key && key.name === 'f8') {
      setActiveOpen();
      return;
    }

    if (key && key.name === 'f9') {
      toggleInProgress();
      return;
    }

    if (key && key.name === 'f10') {
      toggleActiveDone();
      return;
    }

    if (key && key.name === 'f4') {
      await copyTodos();
      return;
    }

    if (key && key.name === 'f5') {
      printTodos();
      return;
    }

    if (key && key.name === 'enter') {
      if (state.activeIndex === state.todos.length - 1 && state.todos.length < 50) {
        state.todos.push({ text: '', done: false });
        state.activeIndex = state.todos.length - 1;
        refreshScreen(`Added item ${state.activeIndex + 1}`);
        return;
      }
      changeActive(1);
      return;
    }

    if (key && key.name === 'backspace') {
      const todo = state.todos[state.activeIndex];
      if (todo.text.length > 0) {
        todo.text = todo.text.slice(0, -1);
        refreshScreen();
      }
      return;
    }

    if (key && ((key.name === 'v' && key.ctrl) || (key.name === 'insert' && key.shift))) {
      const res = await readClipboard();
      if (res.ok) {
        const todo = state.todos[state.activeIndex];
        todo.text = `${todo.text}${res.text}`;
        refreshScreen('Pasted from clipboard');
      } else {
        setStatus('Clipboard read failed; paste unavailable');
        screen.render();
      }
      return;
    }

    if (ch && ch.length === 1 && (!key || (!key.ctrl && !key.meta))) {
      const todo = state.todos[state.activeIndex];
      todo.text = `${todo.text}${ch}`;
      refreshScreen();
    }
  });

  refreshScreen();
}

main();
