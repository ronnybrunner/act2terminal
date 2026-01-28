#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const blessed = require('blessed');

const DEFAULT_COUNT = 2;
const DEFAULT_PRESET = 'squares';
const DEFAULT_HEADER_STYLE = 'markdown';

const PRESETS = {
  squares: {
    label: 'Squares',
    openToken: '□',
    inProgressToken: '■',
    doneToken: '✓',
    supportsBrackets: true,
  },
  markdown: {
    label: 'Markdown',
    openToken: ' ',
    inProgressToken: '~',
    doneToken: 'x',
    supportsBrackets: true,
  },
  arrows: {
    label: 'Arrows',
    openToken: ' ',
    inProgressToken: '>',
    doneToken: '✓',
    supportsBrackets: true,
  },
  minimal: {
    label: 'Minimal',
    openToken: ' ',
    inProgressToken: '*',
    doneToken: '✓',
    supportsBrackets: true,
  },
  pipeTree: {
    label: 'Pipe Tree',
    openToken: '| ',
    inProgressToken: '|> ',
    doneToken: '| ✓ ',
    supportsBrackets: false,
  },
  asciiBranch: {
    label: 'ASCII Branch',
    openToken: '|- ',
    inProgressToken: '|> ',
    doneToken: '|✓ ',
    supportsBrackets: false,
  },
  bullets: {
    label: 'Bullets',
    openToken: '• ',
    inProgressToken: '▸ ',
    doneToken: '✓ ',
    supportsBrackets: false,
  },
  boxDrawing: {
    label: 'Box Drawing',
    openToken: '│ ',
    inProgressToken: '│▶ ',
    doneToken: '│✓ ',
    supportsBrackets: false,
  },
};

const HEADER_STYLES = {
  markdown: { label: '# Actionplan <ID> (YYYY-MM-DD HH:mm)', prefix: '# Actionplan' },
  plain: { label: 'Actionplan <ID> (YYYY-MM-DD HH:mm)', prefix: 'Actionplan' },
};

const HELP_LINE = 'Tab=Menu, F2=New, F4=Copy, F5=Print, F6=Save, F7=Load, ↑↓=Select, Enter=Next, F8=Open, F9=In progress, F10=Done, ESC/Ctrl+C/Ctrl+Q=Exit';

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

function formatIdTimestamp(date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}${month}${day}-${hours}${minutes}`;
}

function generateRandomSuffix() {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return suffix.padEnd(4, '0').slice(0, 4);
}

function generateId(date = new Date()) {
  return `${formatIdTimestamp(date)}-${generateRandomSuffix()}`;
}

function ensureTodos(rawTodos) {
  if (!Array.isArray(rawTodos) || rawTodos.length === 0) {
    return Array.from({ length: DEFAULT_COUNT }, () => ({ text: '', done: false }));
  }
  return rawTodos.map((todo) => ({
    text: typeof todo?.text === 'string' ? todo.text : '',
    done: Boolean(todo?.done),
  }));
}

function normalizeState(data = {}) {
  const parsedDate = data.generatedAt ? new Date(data.generatedAt) : new Date();
  const generatedAt = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const todos = ensureTodos(data.todos);
  const activeIndex = clamp(
    typeof data.activeIndex === 'number' ? data.activeIndex : 0,
    0,
    Math.max(0, todos.length - 1),
  );
  const validInProgress = typeof data.inProgressIndex === 'number'
    ? clamp(data.inProgressIndex, 0, Math.max(0, todos.length - 1))
    : null;
  const presetKey = PRESETS[data.presetKey] ? data.presetKey : DEFAULT_PRESET;
  const headerStyleKey = HEADER_STYLES[data.headerStyle]
    ? data.headerStyle
    : (HEADER_STYLES[data.headerStyleKey] ? data.headerStyleKey : DEFAULT_HEADER_STYLE);
  const id = data.id || generateId(generatedAt);
  const showBrackets = typeof data.showBrackets === 'boolean' ? data.showBrackets : true;

  return {
    todos,
    activeIndex,
    inProgressIndex: validInProgress,
    generatedAt,
    presetKey,
    headerStyleKey,
    id,
    showBrackets,
  };
}

let storageDir;
let storageError;

function getStorageDir() {
  if (storageDir) {
    return { dir: storageDir, error: null };
  }
  const base = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'act2terminal', 'actionplans')
    : path.join(os.homedir(), '.act2terminal', 'actionplans');
  try {
    fs.mkdirSync(base, { recursive: true });
    storageDir = base;
    storageError = null;
    return { dir: storageDir, error: null };
  } catch (err) {
    storageError = err;
    return { dir: null, error: err };
  }
}

function getPlanFilePath(id) {
  const { dir } = getStorageDir();
  if (!dir) return null;
  return path.join(dir, `${id}.json`);
}

function serializeState(state) {
  return {
    id: state.id,
    generatedAt: state.generatedAt.toISOString(),
    presetKey: state.presetKey,
    headerStyle: state.headerStyleKey,
    inProgressIndex: state.inProgressIndex,
    showBrackets: state.showBrackets,
    todos: state.todos.map((todo) => ({ text: todo.text, done: todo.done })),
  };
}

function savePlan(state) {
  const filePath = getPlanFilePath(state.id);
  if (!filePath) return { ok: false, error: storageError || new Error('Storage unavailable') };
  try {
    const data = JSON.stringify(serializeState(state), null, 2);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, data, 'utf8');
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, error: err };
  }
}

function loadPlanFromFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return { ok: true, state: normalizeState(parsed) };
  } catch (err) {
    return { ok: false, error: err };
  }
}

function listSavedPlans() {
  const { dir, error } = getStorageDir();
  if (!dir) return { ok: false, error };
  let files;
  try {
    fs.mkdirSync(dir, { recursive: true });
    files = fs.readdirSync(dir).filter((file) => file.endsWith('.json'));
  } catch (err) {
    return { ok: false, error: err };
  }

  const plans = [];
  for (const file of files) {
    try {
      const filePath = path.join(dir, file);
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      const generatedAt = parsed.generatedAt ? new Date(parsed.generatedAt) : null;
      plans.push({
        id: parsed.id || path.basename(file, '.json'),
        generatedAt,
        todoCount: Array.isArray(parsed.todos) ? parsed.todos.length : 0,
        filePath,
      });
    } catch (err) {
      // ignore malformed files
    }
  }

  plans.sort((a, b) => {
    const timeA = a.generatedAt ? a.generatedAt.getTime() : 0;
    const timeB = b.generatedAt ? b.generatedAt.getTime() : 0;
    if (timeA !== timeB) return timeB - timeA;
    return a.id < b.id ? 1 : -1;
  });

  return { ok: true, plans };
}

function deletePlanFile(filePath) {
  try {
    fs.unlinkSync(filePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}

function initState() {
  const generatedAt = new Date();
  return normalizeState({
    generatedAt,
    id: generateId(generatedAt),
    todos: Array.from({ length: DEFAULT_COUNT }, () => ({ text: '', done: false })),
    presetKey: DEFAULT_PRESET,
    headerStyle: DEFAULT_HEADER_STYLE,
    showBrackets: true,
  });
}

function buildHeader(state) {
  const style = HEADER_STYLES[state.headerStyleKey] || HEADER_STYLES.markdown;
  const id = state.id || '????';
  return `${style.prefix} ${id} (${formatDate(state.generatedAt)})`;
}

function getPreset(state) {
  return PRESETS[state.presetKey] || PRESETS.squares;
}

function normalizeToken(token) {
  return String(token ?? '').trimEnd();
}

function getDisplayTokens(preset) {
  return {
    openToken: normalizeToken(preset.openToken),
    inProgressToken: normalizeToken(preset.inProgressToken),
    doneToken: normalizeToken(preset.doneToken),
  };
}

function getEffectiveBrackets(state, preset) {
  const supportsBrackets = preset.supportsBrackets !== false;
  return Boolean(state.showBrackets && supportsBrackets);
}

function getToken(state, tokens, idx) {
  const todo = state.todos[idx];
  if (todo.done) return tokens.doneToken;
  if (state.inProgressIndex === idx) return tokens.inProgressToken;
  return tokens.openToken;
}

function formatStatusToken(token, effectiveBrackets) {
  const core = normalizeToken(token);
  if (effectiveBrackets) {
    const bracketCore = core === '' ? ' ' : core;
    return `[${bracketCore}] `;
  }
  const plainCore = core === '' ? '' : core;
  return `${plainCore} `;
}

function renderPlain(state) {
  const header = buildHeader(state);
  const preset = getPreset(state);
  const tokens = getDisplayTokens(preset);
  const effectiveBrackets = getEffectiveBrackets(state, preset);
  const lines = state.todos.map((todo, idx) => {
    const token = getToken(state, tokens, idx);
    const text = todo.text ? todo.text : '';
    return `${formatStatusToken(token, effectiveBrackets)}${text}`;
  });
  return [header, '', ...lines].join('\n');
}

function renderScreen(state) {
  const header = buildHeader(state);
  const preset = getPreset(state);
  const tokens = getDisplayTokens(preset);
  const effectiveBrackets = getEffectiveBrackets(state, preset);
  const lines = state.todos.map((todo, idx) => {
    const token = getToken(state, tokens, idx);
    const hasText = Boolean(todo.text && todo.text.trim() !== '');
    const text = hasText ? todo.text : '{gray-fg}<type todo...>{/gray-fg}';
    const cursor = idx === state.activeIndex ? '▏' : '';
    const uiText = cursor ? `${text}${cursor}` : text;
    const marker = idx === state.activeIndex ? '▸' : ' ';
    const line = `${marker} ${formatStatusToken(token, effectiveBrackets)}${uiText}`;
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

  let state = initState();

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

  let loadBox;
  let loadOpen = false;
  let loadSelection = 0;
  let savedPlans = [];

  const initialStorage = getStorageDir();
  const initialStatusMessage = initialStorage.error
    ? `Storage unavailable: ${initialStorage.error.message}`
    : undefined;

  function setStatus(msg) {
    status.setContent(` ${msg}`);
  }

  function formatStatusLine() {
    const progress = state.inProgressIndex !== null ? state.inProgressIndex + 1 : '-';
    const preset = getPreset(state);
    const brackets = getEffectiveBrackets(state, preset) ? 'on' : 'off';
    return `Active: ${state.activeIndex + 1}/${state.todos.length}, In progress: ${progress}, Preset: ${preset.label}, Brackets: ${brackets}`;
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

  function startNewPlan() {
    state = initState();
    closeMenu();
    closeLoadOverlay();
    refreshScreen(`New plan ${state.id}`);
  }

  function handleSavePlan() {
    const result = savePlan(state);
    if (result.ok) {
      refreshScreen(`Saved ${state.id}`);
      return;
    }
    const message = result.error?.message || 'Save failed';
    refreshScreen(`Save failed: ${message}`);
  }

  function applyLoadedState(nextState) {
    state = nextState;
    state.activeIndex = clamp(state.activeIndex, 0, Math.max(0, state.todos.length - 1));
    if (state.inProgressIndex !== null && state.inProgressIndex >= state.todos.length) {
      state.inProgressIndex = null;
    }
  }

  function handleLoadFile(filePath) {
    const loaded = loadPlanFromFile(filePath);
    if (!loaded.ok) {
      const message = loaded.error?.message || 'Load failed';
      refreshScreen(`Load failed: ${message}`);
      return;
    }
    applyLoadedState(loaded.state);
    closeLoadOverlay();
    closeMenu();
    refreshScreen(`Loaded ${state.id}`);
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
      { type: 'section', text: 'Display' },
      { type: 'brackets', selectable: true },
      { type: 'spacer' },
      { type: 'section', text: 'Symbol Presets' },
      ...Object.keys(PRESETS).map((key) => ({ type: 'preset', key, selectable: true })),
      { type: 'spacer' },
      { type: 'section', text: 'Header Style' },
      { type: 'header', key: 'markdown', selectable: true },
      { type: 'header', key: 'plain', selectable: true },
      { type: 'spacer' },
      { type: 'section', text: 'Actions' },
      { type: 'action', id: 'save', label: 'Save (F6)', selectable: true },
      { type: 'action', id: 'load', label: 'Load (F7)', selectable: true },
      { type: 'action', id: 'new', label: 'New Plan (F2)', selectable: true },
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
      } else if (item.type === 'brackets') {
        const options = state.showBrackets ? '(x) an  ( ) aus' : '( ) an  (x) aus';
        const currentPreset = getPreset(state);
        const effective = getEffectiveBrackets(state, currentPreset) ? 'an' : 'aus';
        line = `Klammern anzeigen: ${options}  (aktuell: ${effective})`;
      } else if (item.type === 'preset') {
        const preset = PRESETS[item.key];
        const radio = state.presetKey === item.key ? '(x)' : '( )';
        const tokens = getDisplayTokens(preset);
        const effective = getEffectiveBrackets(state, preset);
        const preview = [
          formatStatusToken(tokens.openToken, effective).trimEnd(),
          formatStatusToken(tokens.inProgressToken, effective).trimEnd(),
          formatStatusToken(tokens.doneToken, effective).trimEnd(),
        ].join(' ');
        const supportLabel = preset.supportsBrackets === false ? '· ohne Klammern' : '· Klammern';
        line = `${radio} ${preset.label} ${preview} ${supportLabel}`;
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
    if (!selected) return;
    if (selected.type === 'count') {
      const result = applyCount(state, state.todos.length + delta);
      if (result.changed) {
        const message = result.trimmed ? `Trimmed to ${result.count}` : `Count: ${result.count}`;
        refreshScreen(message);
      }
      renderMenu();
      return;
    }

    if (selected.type === 'brackets') {
      const nextValue = delta > 0;
      const changed = state.showBrackets !== nextValue;
      state.showBrackets = nextValue;
      if (changed) {
        const effective = getEffectiveBrackets(state, getPreset(state)) ? 'on' : 'off';
        refreshScreen(`Brackets: ${effective}`);
      }
      renderMenu();
    }
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

    if (selected.type === 'brackets') {
      state.showBrackets = !state.showBrackets;
      const effective = getEffectiveBrackets(state, getPreset(state)) ? 'on' : 'off';
      refreshScreen(`Brackets: ${effective}`);
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

    if (selected.type === 'action' && selected.id === 'save') {
      handleSavePlan();
      renderMenu();
    }

    if (selected.type === 'action' && selected.id === 'load') {
      closeMenu();
      openLoadOverlay();
    }

    if (selected.type === 'action' && selected.id === 'new') {
      startNewPlan();
      renderMenu();
    }
  }

  function buildLoadOverlay() {
    loadBox = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '70%',
      height: '70%',
      border: 'line',
      label: ' Load plan ',
      tags: true,
      keys: true,
      mouse: true,
      scrollable: true,
      alwaysScroll: true,
      hidden: true,
      scrollbar: { ch: ' ', inverse: true },
    });
  }

  function renderLoadOverlay() {
    if (!loadBox) return;
    if (!savedPlans.length) {
      loadBox.setContent('No saved plans');
      screen.render();
      return;
    }

    loadSelection = clamp(loadSelection, 0, Math.max(0, savedPlans.length - 1));
    const lines = savedPlans.map((plan, idx) => {
      const validDate = plan.generatedAt instanceof Date && !Number.isNaN(plan.generatedAt.getTime());
      const dateText = validDate ? formatDate(plan.generatedAt) : 'unknown time';
      const line = `${plan.id}  ${dateText}  (${plan.todoCount} items)`;
      return idx === loadSelection ? `{inverse}${line}{/inverse}` : line;
    });
    loadBox.setContent(lines.join('\n'));
    screen.render();
  }

  function openLoadOverlay() {
    const list = listSavedPlans();
    if (!list.ok) {
      const message = list.error?.message || 'Load failed';
      refreshScreen(`Load failed: ${message}`);
      return;
    }

    savedPlans = list.plans;
    loadSelection = 0;

    if (!loadBox) buildLoadOverlay();
    loadOpen = true;
    loadBox.show();
    loadBox.focus();
    renderLoadOverlay();
    setStatus('Load: Enter=load, Del=delete, ESC=close');
    screen.render();
  }

  function closeLoadOverlay() {
    if (!loadOpen) return;
    loadOpen = false;
    if (loadBox) loadBox.hide();
    refreshScreen();
  }

  function moveLoadSelection(delta) {
    if (!loadOpen) return;
    if (!savedPlans.length) {
      renderLoadOverlay();
      return;
    }
    const next = clamp(loadSelection + delta, 0, Math.max(0, savedPlans.length - 1));
    if (next !== loadSelection) {
      loadSelection = next;
      renderLoadOverlay();
    }
  }

  function handleLoadOverlayEnter() {
    if (!loadOpen) return;
    if (!savedPlans.length) {
      closeLoadOverlay();
      refreshScreen('No saved plans');
      return;
    }
    const selected = savedPlans[loadSelection];
    handleLoadFile(selected.filePath);
  }

  function handleLoadOverlayDelete() {
    if (!loadOpen || !savedPlans.length) return;
    const target = savedPlans[loadSelection];
    const result = deletePlanFile(target.filePath);
    if (!result.ok) {
      const message = result.error?.message || 'Delete failed';
      refreshScreen(`Delete failed: ${message}`);
      renderLoadOverlay();
      return;
    }
    savedPlans.splice(loadSelection, 1);
    if (loadSelection >= savedPlans.length) {
      loadSelection = Math.max(0, savedPlans.length - 1);
    }
    renderLoadOverlay();
    setStatus(`Deleted ${target.id}`);
    screen.render();
  }

  screen.on('keypress', async (ch, key) => {
    if (key && ((key.ctrl && key.name === 'c') || ((key.ctrl || key.meta) && key.name === 'q'))) {
      exit();
      return;
    }

    if (loadOpen) {
      if (!key) return;
      if (key.name === 'escape' || key.name === 'tab') {
        closeLoadOverlay();
        return;
      }
      if (key.name === 'up' || ((key.meta || key.ctrl) && key.name === 'k')) {
        moveLoadSelection(-1);
        return;
      }
      if (key.name === 'down' || ((key.meta || key.ctrl) && key.name === 'j')) {
        moveLoadSelection(1);
        return;
      }
      if (key.name === 'enter') {
        handleLoadOverlayEnter();
        return;
      }
      if (key.name === 'delete') {
        handleLoadOverlayDelete();
        return;
      }
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

    if (key && key.name === 'f7') {
      closeMenu();
      openLoadOverlay();
      return;
    }

    if (key && key.name === 'f6') {
      handleSavePlan();
      return;
    }

    if (key && key.name === 'f2') {
      startNewPlan();
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

  refreshScreen(initialStatusMessage);
}

main();
