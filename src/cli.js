#!/usr/bin/env node
'use strict';

const blessed = require('blessed');

const DEFAULT_COUNT = 5;
const DEFAULT_PRESET = 'squares';
const DEFAULT_HEADER_STYLE = 'markdown';

const PRESETS = {
  squares: { label: 'Squares', openToken: '□', inProgressToken: '■', doneToken: '✓' },
  markdown: { label: 'Markdown', openToken: ' ', inProgressToken: '~', doneToken: 'x' },
  arrows: { label: 'Arrows', openToken: ' ', inProgressToken: '>', doneToken: '✓' },
  minimal: { label: 'Minimal', openToken: ' ', inProgressToken: '*', doneToken: '✓' },
};

const HEADER_STYLES = {
  markdown: { label: '# Actionplan (YYYY-MM-DD HH:mm)', prefix: '# Actionplan' },
  plain: { label: 'Actionplan (YYYY-MM-DD HH:mm)', prefix: 'Actionplan' },
};

const HELP_LINE = 'Tab=Menu, F4=Copy, F5=Print, ↑↓=Select, Enter=Save, F9=In progress, F10=Done, ESC=Exit';

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
    todos: Array.from({ length: DEFAULT_COUNT }, () => ({ text: '', status: 'OPEN' })),
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

function getToken(state, idx) {
  const preset = PRESETS[state.presetKey] || PRESETS.squares;
  const todo = state.todos[idx];
  if (todo.status === 'DONE') return preset.doneToken;
  if (state.inProgressIndex === idx) return preset.inProgressToken;
  return preset.openToken;
}

function renderPlain(state) {
  const header = buildHeader(state);
  const lines = state.todos.map((todo, idx) => {
    const token = getToken(state, idx);
    const text = todo.text ? todo.text : '';
    return `[${token}] ${text}`;
  });
  return [header, '', ...lines].join('\n');
}

function renderScreen(state) {
  const header = buildHeader(state);
  const lines = state.todos.map((todo, idx) => {
    const token = getToken(state, idx);
    const hasText = Boolean(todo.text && todo.text.trim() !== '');
    const text = hasText ? todo.text : '{gray-fg}<enter todo...>{/gray-fg}';
    const marker = idx === state.activeIndex ? '▸' : ' ';
    const line = `${marker} [${token}] ${text}`;
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
      state.todos.push({ text: '', status: 'OPEN' });
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
    height: '100%-4',
    border: 'line',
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    mouse: true,
    vi: true,
    tags: true,
    scrollbar: { ch: ' ', inverse: true },
  });

  blessed.text({
    parent: mainBox,
    top: '100%-4',
    left: 1,
    content: 'Edit:',
  });

  const editor = blessed.textbox({
    parent: mainBox,
    top: '100%-3',
    left: 0,
    width: '100%',
    height: 3,
    border: 'line',
    inputOnFocus: true,
    keys: true,
    mouse: true,
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
    const preset = PRESETS[state.presetKey] || PRESETS.squares;
    return `Active: ${state.activeIndex + 1}/${state.todos.length}, In progress: ${progress}, Preset: ${preset.label}`;
  }

  function syncEditor() {
    editor.setValue(state.todos[state.activeIndex].text || '');
    editor.focus();
  }

  function saveEditorValue() {
    state.todos[state.activeIndex].text = editor.getValue() || '';
  }

  function refreshScreen(message) {
    outputBox.setContent(renderScreen(state));
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
    saveEditorValue();
    const next = clamp(state.activeIndex + delta, 0, state.todos.length - 1);
    if (next !== state.activeIndex) {
      state.activeIndex = next;
      syncEditor();
      refreshScreen();
    } else {
      refreshScreen();
    }
  }

  function toggleActiveDone() {
    saveEditorValue();
    const todo = state.todos[state.activeIndex];
    todo.status = todo.status === 'DONE' ? 'OPEN' : 'DONE';
    if (todo.status === 'DONE' && state.inProgressIndex === state.activeIndex) {
      state.inProgressIndex = null;
    }
    refreshScreen(`Done toggled for ${state.activeIndex + 1}`);
  }

  function toggleInProgress() {
    saveEditorValue();
    if (state.inProgressIndex === state.activeIndex) {
      state.inProgressIndex = null;
      refreshScreen('In progress: -');
      return;
    }
    state.inProgressIndex = state.activeIndex;
    refreshScreen(`In progress: ${state.activeIndex + 1}`);
  }

  async function copyTodos() {
    saveEditorValue();
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
    saveEditorValue();
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

    menuBox.key(['enter'], () => {
      handleMenuEnter();
    });
  }

  function openMenu() {
    saveEditorValue();
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
    syncEditor();
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
    saveEditorValue();
    const result = applyCount(state, state.todos.length + delta);
    if (result.changed) {
      syncEditor();
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

  editor.on('submit', () => {
    saveEditorValue();
    refreshScreen(`Saved Actionplan item ${state.activeIndex + 1}`);
  });

  editor.key(['C-v', 'S-insert'], async () => {
    const res = await readClipboard();
    if (res.ok) {
      const nextValue = (editor.getValue() || '') + res.text;
      editor.setValue(nextValue);
      saveEditorValue();
      refreshScreen('Pasted from clipboard');
      editor.focus();
    } else {
      setStatus('Clipboard read failed; paste unavailable');
      screen.render();
    }
  });

  screen.key(['tab'], () => {
    if (menuOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  screen.key(['escape'], () => {
    if (menuOpen) {
      closeMenu();
      return;
    }
    exit();
  });

  screen.key(['q', 'C-c'], exit);

  screen.key(['up', 'k'], () => {
    if (menuOpen) {
      moveMenuSelection(-1);
      return;
    }
    changeActive(-1);
  });

  screen.key(['down', 'j'], () => {
    if (menuOpen) {
      moveMenuSelection(1);
      return;
    }
    changeActive(1);
  });

  screen.key(['left'], () => {
    if (menuOpen) {
      handleMenuCount(-1);
    }
  });

  screen.key(['right'], () => {
    if (menuOpen) {
      handleMenuCount(1);
    }
  });

  screen.key(['f9'], () => {
    if (!menuOpen) toggleInProgress();
  });

  screen.key(['f10'], () => {
    if (!menuOpen) toggleActiveDone();
  });

  screen.key(['f4'], () => {
    if (!menuOpen) copyTodos();
  });

  screen.key(['f5'], () => {
    if (!menuOpen) printTodos();
  });

  syncEditor();
  refreshScreen();
}

main();
