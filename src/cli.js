#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const blessed = require('blessed');

const DEFAULT_COUNT = 2;
const DEFAULT_PRESET = 'squares';
const DEFAULT_HEADER_STYLE = 'markdown';

const DEFAULT_WRAP_MODE = 'soft';
const DEFAULT_WRAP_WIDTH = 80;
const DEFAULT_WRAP_INDENT = 2;

const DEFAULT_FRAME_ENABLED = false;
const DEFAULT_FRAME_STYLE = 'double';
const DEFAULT_FRAME_PADDING_X = 1;
const DEFAULT_FRAME_PADDING_Y = 0;

const FRAME_STYLES = {
  none: {
    label: 'Off',
    corners: [' ', ' ', ' ', ' '],
    horiz: ' ',
    vert: ' ',
  },
  ascii: {
    label: 'ASCII',
    corners: ['+', '+', '+', '+'],
    horiz: '-',
    vert: '|',
  },
  single: {
    label: 'Single',
    corners: ['┌', '┐', '└', '┘'],
    horiz: '─',
    vert: '│',
  },
  double: {
    label: 'Double',
    corners: ['╔', '╗', '╚', '╝'],
    horiz: '═',
    vert: '║',
  },
};

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

const HELP_LINE = 'F1=Help, Tab=Menu, F2=New, F4=Copy, F5=Print, F6=Save, F7=Load, ↑↓=Select, Enter=Next, Shift+Enter=New line, F8=Open, F9=In progress, F10=Done, ESC/Ctrl+C/Ctrl+Q=Exit';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pad(num) {
  return num.toString().padStart(2, '0');
}

function repeat(ch, count) {
  return count > 0 ? ch.repeat(count) : '';
}

function stripTags(text) {
  return text.replace(/\{\/?.*?\}/g, '');
}

function visibleLength(text) {
  return stripTags(text).length;
}

function safeNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function coerceWrapMode(mode) {
  return mode === 'off' || mode === 'hard' ? mode : DEFAULT_WRAP_MODE;
}

function coerceFrameStyle(style) {
  return FRAME_STYLES[style] ? style : DEFAULT_FRAME_STYLE;
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
  const wrapMode = coerceWrapMode(data.wrapMode);
  const wrapWidth = clamp(Math.round(safeNumber(data.wrapWidth, DEFAULT_WRAP_WIDTH)), 40, 200);
  const wrapIndent = clamp(Math.round(safeNumber(data.wrapIndent, DEFAULT_WRAP_INDENT)), 0, 12);
  const frameEnabled = typeof data.frameEnabled === 'boolean'
    ? data.frameEnabled
    : DEFAULT_FRAME_ENABLED;
  const frameStyleRaw = coerceFrameStyle(data.frameStyle);
  const frameStyle = frameStyleRaw;
  const framePaddingX = clamp(Math.round(safeNumber(data.framePaddingX, DEFAULT_FRAME_PADDING_X)), 0, 8);
  const framePaddingY = clamp(Math.round(safeNumber(data.framePaddingY, DEFAULT_FRAME_PADDING_Y)), 0, 4);

  return {
    todos,
    activeIndex,
    inProgressIndex: validInProgress,
    generatedAt,
    presetKey,
    headerStyleKey,
    id,
    showBrackets,
    wrapMode,
    wrapWidth,
    wrapIndent,
    frameEnabled,
    frameStyle,
    framePaddingX,
    framePaddingY,
    isDirty: false,
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
    wrapMode: state.wrapMode,
    wrapWidth: state.wrapWidth,
    wrapIndent: state.wrapIndent,
    frameEnabled: state.frameEnabled,
    frameStyle: state.frameStyle,
    framePaddingX: state.framePaddingX,
    framePaddingY: state.framePaddingY,
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
    wrapMode: DEFAULT_WRAP_MODE,
    wrapWidth: DEFAULT_WRAP_WIDTH,
    wrapIndent: DEFAULT_WRAP_INDENT,
    frameEnabled: DEFAULT_FRAME_ENABLED,
    frameStyle: DEFAULT_FRAME_STYLE,
    framePaddingX: DEFAULT_FRAME_PADDING_X,
    framePaddingY: DEFAULT_FRAME_PADDING_Y,
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

function wrapParagraph(text, firstWidth, subsequentWidth) {
  if (!Number.isFinite(firstWidth) || firstWidth <= 0) {
    return [text];
  }

  const lines = [];
  const words = text.split(' ');
  let current = '';
  let limit = firstWidth;
  const otherLimit = Number.isFinite(subsequentWidth) && subsequentWidth > 0
    ? subsequentWidth
    : firstWidth;

  function flush() {
    lines.push(current);
    current = '';
    limit = otherLimit;
  }

  for (const word of words) {
    const effectiveWord = word;
    if (current === '') {
      if (effectiveWord.length <= limit) {
        current = effectiveWord;
      } else {
        let remaining = effectiveWord;
        while (remaining.length > limit && limit > 0) {
          lines.push(remaining.slice(0, limit));
          remaining = remaining.slice(limit);
          limit = otherLimit;
        }
        current = remaining;
      }
      continue;
    }

    const nextLength = current.length + 1 + effectiveWord.length;
    if (nextLength <= limit) {
      current = `${current} ${effectiveWord}`;
      continue;
    }

    flush();
    if (effectiveWord.length <= limit) {
      current = effectiveWord;
    } else {
      let remaining = effectiveWord;
      while (remaining.length > limit && limit > 0) {
        lines.push(remaining.slice(0, limit));
        remaining = remaining.slice(limit);
        limit = otherLimit;
      }
      current = remaining;
    }
  }

  if (current !== '' || !lines.length) {
    lines.push(current);
  }

  return lines;
}

function wrapItemText(text, totalWidth, firstPrefix, indentPrefix, wrapMode, wrapIndentValue) {
  const lines = [];
  const useWrap = wrapMode === 'hard' && Number.isFinite(totalWidth);
  const baseIndentPrefix = indentPrefix || repeat(' ', visibleLength(firstPrefix) + wrapIndentValue);
  const indentWidth = visibleLength(baseIndentPrefix);
  const firstWidth = useWrap ? totalWidth - visibleLength(firstPrefix) : Infinity;
  const otherWidth = useWrap ? totalWidth - indentWidth : Infinity;

  const paragraphs = String(text || '').split('\n');
  paragraphs.forEach((segment, idx) => {
    const prefixForFirst = idx === 0 ? firstPrefix : baseIndentPrefix;
    const firstLineWidth = idx === 0 ? firstWidth : otherWidth;
    if (!useWrap) {
      const prefixed = `${prefixForFirst}${segment}`;
      lines.push(prefixed);
      return;
    }

    const wrapped = wrapParagraph(segment, Math.max(1, firstLineWidth), Math.max(1, otherWidth));
    wrapped.forEach((part, partIdx) => {
      const prefix = (idx === 0 && partIdx === 0) ? firstPrefix : baseIndentPrefix;
      lines.push(`${prefix}${part}`);
    });
  });

  return lines;
}

function wrapHeaderLine(text, totalWidth, wrapMode) {
  if (wrapMode !== 'hard' || !Number.isFinite(totalWidth)) {
    return [text];
  }
  return wrapParagraph(text, Math.max(1, totalWidth), Math.max(1, totalWidth));
}

function wrapAndFrame(lines, opts) {
  const frameEnabled = opts?.frameEnabled;
  const frameStyleKey = opts?.frameStyle;
  if (!frameEnabled || frameStyleKey === 'none') {
    return lines.join('\n');
  }

  const style = FRAME_STYLES[frameStyleKey] || FRAME_STYLES[DEFAULT_FRAME_STYLE];
  const paddingX = clamp(safeNumber(opts.framePaddingX, DEFAULT_FRAME_PADDING_X), 0, 8);
  const paddingY = clamp(safeNumber(opts.framePaddingY, DEFAULT_FRAME_PADDING_Y), 0, 4);
  const maxContent = lines.reduce((max, line) => Math.max(max, visibleLength(line)), 0);
  const innerWidth = maxContent + paddingX * 2;
  const top = `${style.corners[0]}${repeat(style.horiz, innerWidth)}${style.corners[1]}`;
  const bottom = `${style.corners[2]}${repeat(style.horiz, innerWidth)}${style.corners[3]}`;
  const paddingLine = `${style.vert}${repeat(' ', innerWidth)}${style.vert}`;
  const framed = [];
  framed.push(top);
  for (let i = 0; i < paddingY; i += 1) {
    framed.push(paddingLine);
  }
  lines.forEach((line) => {
    const contentLen = visibleLength(line);
    const rightPad = innerWidth - paddingX - contentLen;
    const padded = `${style.vert}${repeat(' ', paddingX)}${line}${repeat(' ', Math.max(0, rightPad))}${style.vert}`;
    framed.push(padded);
  });
  for (let i = 0; i < paddingY; i += 1) {
    framed.push(paddingLine);
  }
  framed.push(bottom);
  return framed.join('\n');
}

function renderPlain(state) {
  const header = buildHeader(state);
  const wrapWidth = state.wrapMode === 'hard' ? state.wrapWidth : Infinity;
  const headerLines = wrapHeaderLine(header, wrapWidth, state.wrapMode);
  const preset = getPreset(state);
  const tokens = getDisplayTokens(preset);
  const effectiveBrackets = getEffectiveBrackets(state, preset);

  const itemLines = state.todos.flatMap((todo, idx) => {
    const token = getToken(state, tokens, idx);
    const firstPrefix = formatStatusToken(token, effectiveBrackets);
    const indentPrefix = repeat(' ', visibleLength(firstPrefix) + state.wrapIndent);
    return wrapItemText(
      todo.text || '',
      wrapWidth,
      firstPrefix,
      indentPrefix,
      state.wrapMode,
      state.wrapIndent,
    );
  });

  const assembled = [...headerLines, '', ...itemLines];
  if (!state.frameEnabled || state.frameStyle === 'none') {
    return assembled.join('\n');
  }

  return wrapAndFrame(assembled, {
    frameEnabled: state.frameEnabled,
    frameStyle: state.frameStyle,
    framePaddingX: state.framePaddingX,
    framePaddingY: state.framePaddingY,
  });
}

function renderScreen(state, outputWidth) {
  const header = buildHeader(state);
  const preset = getPreset(state);
  const tokens = getDisplayTokens(preset);
  const effectiveBrackets = getEffectiveBrackets(state, preset);
  const estimatedWidth = typeof outputWidth === 'number' ? outputWidth : 80;
  const paddingCost = state.frameEnabled && state.frameStyle !== 'none'
    ? (state.framePaddingX * 2 + 2)
    : 0;
  const availableWidth = Math.max(20, estimatedWidth - paddingCost);
  const wrapModeForScreen = state.wrapMode === 'off' ? 'off' : 'hard';
  const wrapWidth = state.wrapMode === 'off'
    ? Infinity
    : Math.max(10, state.wrapMode === 'hard'
      ? Math.min(state.wrapWidth, availableWidth)
      : availableWidth);

  const headerLines = wrapHeaderLine(
    header,
    wrapModeForScreen === 'hard' ? wrapWidth : Infinity,
    wrapModeForScreen,
  );

  const itemLines = state.todos.flatMap((todo, idx) => {
    const hasText = Boolean(todo.text && todo.text.trim() !== '');
    const marker = idx === state.activeIndex ? '▸' : ' ';
    const token = getToken(state, tokens, idx);
    const firstPrefix = `${marker} ${formatStatusToken(token, effectiveBrackets)}`;
    const indentPrefix = repeat(' ', visibleLength(firstPrefix) + state.wrapIndent);
    let wrapped = wrapItemText(
      hasText ? todo.text : '<type todo...>',
      wrapWidth,
      firstPrefix,
      indentPrefix,
      wrapModeForScreen,
      state.wrapIndent,
    );

    if (!hasText) {
      wrapped = wrapped.map((line) => line.replace('<type todo...>', '{gray-fg}<type todo...>{/gray-fg}'));
    }

    if (idx === state.activeIndex) {
      const lastIdx = wrapped.length - 1;
      wrapped[lastIdx] = `${wrapped[lastIdx]}▏`;
      wrapped = wrapped.map((line) => `{inverse}${line}{/inverse}`);
    }

    return wrapped;
  });

  const assembled = [...headerLines, '', ...itemLines];
  if (!state.frameEnabled || state.frameStyle === 'none') {
    return assembled.join('\n');
  }

  return wrapAndFrame(assembled, {
    frameEnabled: state.frameEnabled,
    frameStyle: state.frameStyle,
    framePaddingX: state.framePaddingX,
    framePaddingY: state.framePaddingY,
  });
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

  let helpBox;
  let helpOpen = false;

  const initialStorage = getStorageDir();
  const initialStatusMessage = initialStorage.error
    ? `Storage unavailable: ${initialStorage.error.message}`
    : undefined;

  function formatStatusLine() {
    const total = state.todos.length;
    const active = total ? state.activeIndex + 1 : 0;
    const doneCount = state.todos.filter((todo) => todo.done).length;
    const doing = state.inProgressIndex !== null ? 1 : 0;
    const open = Math.max(0, total - doneCount - doing);
    const preset = getPreset(state);
    const dirtyMark = state.isDirty ? '*' : ' ';
    return `Active: ${active}/${total}  Open: ${open} | Doing: ${doing} | Done: ${doneCount}  Preset: ${preset.label}  Dirty: ${dirtyMark}`;
  }

  function setStatus(msg) {
    const base = formatStatusLine();
    const text = msg ? `${msg} | ${base}` : base;
    status.setContent(` ${text}`);
  }

  function markDirty() {
    if (!state.isDirty) {
      state.isDirty = true;
    }
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
    const estimatedBoxWidth = typeof outputBox.width === 'number'
      ? outputBox.width
      : Math.floor(screen.width * 0.9);
    const contentWidth = Math.max(20, estimatedBoxWidth - 2);
    outputBox.setContent(renderScreen(state, contentWidth));
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
    markDirty();
    refreshScreen(`Set OPEN: ${state.activeIndex + 1}`);
  }

  function toggleInProgress() {
    if (state.inProgressIndex === state.activeIndex) {
      state.inProgressIndex = null;
      markDirty();
      refreshScreen(`Cleared IN_PROGRESS: ${state.activeIndex + 1}`);
      return;
    }
    state.inProgressIndex = state.activeIndex;
    state.todos[state.activeIndex].done = false;
    markDirty();
    refreshScreen(`Set IN_PROGRESS: ${state.activeIndex + 1}`);
  }

  function toggleActiveDone() {
    const todo = state.todos[state.activeIndex];
    todo.done = !todo.done;
    if (todo.done) {
      if (state.inProgressIndex === state.activeIndex) {
        state.inProgressIndex = null;
      }
      markDirty();
      refreshScreen(`Set DONE: ${state.activeIndex + 1}`);
      return;
    }
    markDirty();
    refreshScreen(`Cleared DONE: ${state.activeIndex + 1}`);
  }

  function startNewPlan() {
    state = initState();
    state.isDirty = false;
    closeMenu();
    closeLoadOverlay();
    refreshScreen(`New plan ${state.id}`);
  }

  function handleSavePlan() {
    const result = savePlan(state);
    if (result.ok) {
      state.isDirty = false;
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
    state.isDirty = false;
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
      { type: 'section', text: 'Frame' },
      { type: 'frameStyle', key: 'none', selectable: true },
      { type: 'frameStyle', key: 'ascii', selectable: true },
      { type: 'frameStyle', key: 'single', selectable: true },
      { type: 'frameStyle', key: 'double', selectable: true },
      { type: 'framePaddingX', selectable: true },
      { type: 'framePaddingY', selectable: true },
      { type: 'spacer' },
      { type: 'section', text: 'Wrap' },
      { type: 'wrapMode', key: 'off', selectable: true },
      { type: 'wrapMode', key: 'soft', selectable: true },
      { type: 'wrapMode', key: 'hard', selectable: true },
      { type: 'wrapWidth', selectable: true },
      { type: 'wrapIndent', selectable: true },
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
      } else if (item.type === 'frameStyle') {
        const isActive = item.key === 'none'
          ? !state.frameEnabled
          : state.frameEnabled && state.frameStyle === item.key;
        const radio = isActive ? '(x)' : '( )';
        const label = item.key === 'none' ? 'off' : FRAME_STYLES[item.key].label;
        line = `${radio} Frame ${label}`;
      } else if (item.type === 'framePaddingX') {
        line = `Padding X: ${state.framePaddingX} (←/→)`;
      } else if (item.type === 'framePaddingY') {
        line = `Padding Y: ${state.framePaddingY} (←/→)`;
      } else if (item.type === 'wrapMode') {
        const radio = state.wrapMode === item.key ? '(x)' : '( )';
        line = `${radio} Wrap ${item.key}`;
      } else if (item.type === 'wrapWidth') {
        const suffix = state.wrapMode === 'hard' ? '' : ' (nur hard)';
        line = `Hard width: ${state.wrapWidth}${suffix} (←/→)`;
      } else if (item.type === 'wrapIndent') {
        line = `Indent: ${state.wrapIndent} (←/→)`;
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
        markDirty();
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
        markDirty();
        const effective = getEffectiveBrackets(state, getPreset(state)) ? 'on' : 'off';
        refreshScreen(`Brackets: ${effective}`);
      }
      renderMenu();
      return;
    }

    if (selected.type === 'framePaddingX') {
      const next = clamp(state.framePaddingX + delta, 0, 4);
      if (next !== state.framePaddingX) {
        state.framePaddingX = next;
        markDirty();
        refreshScreen(`Padding X: ${next}`);
      }
      renderMenu();
      return;
    }

    if (selected.type === 'framePaddingY') {
      const next = clamp(state.framePaddingY + delta, 0, 2);
      if (next !== state.framePaddingY) {
        state.framePaddingY = next;
        markDirty();
        refreshScreen(`Padding Y: ${next}`);
      }
      renderMenu();
      return;
    }

    if (selected.type === 'wrapMode') {
      const order = ['off', 'soft', 'hard'];
      const idx = order.indexOf(state.wrapMode);
      const nextIdx = clamp(idx + delta, 0, order.length - 1);
      const nextMode = order[nextIdx];
      if (nextMode !== state.wrapMode) {
        state.wrapMode = nextMode;
        markDirty();
        refreshScreen(`Wrap: ${nextMode}`);
      }
      renderMenu();
      return;
    }

    if (selected.type === 'wrapWidth') {
      if (state.wrapMode !== 'hard') {
        renderMenu();
        return;
      }
      const next = clamp(state.wrapWidth + (delta * 5), 60, 140);
      if (next !== state.wrapWidth) {
        state.wrapWidth = next;
        markDirty();
        refreshScreen(`Hard width: ${next}`);
      }
      renderMenu();
      return;
    }

    if (selected.type === 'wrapIndent') {
      const next = clamp(state.wrapIndent + delta, 2, 8);
      if (next !== state.wrapIndent) {
        state.wrapIndent = next;
        markDirty();
        refreshScreen(`Indent: ${next}`);
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
        markDirty();
        refreshScreen(`Preset: ${PRESETS[selected.key].label}`);
      }
      renderMenu();
      return;
    }

    if (selected.type === 'brackets') {
      state.showBrackets = !state.showBrackets;
      const effective = getEffectiveBrackets(state, getPreset(state)) ? 'on' : 'off';
      markDirty();
      refreshScreen(`Brackets: ${effective}`);
      renderMenu();
      return;
    }

    if (selected.type === 'frameStyle') {
      if (selected.key === 'none') {
        if (state.frameEnabled) {
          state.frameEnabled = false;
          markDirty();
          refreshScreen('Frame off');
        }
        renderMenu();
        return;
      }
      const nextStyle = coerceFrameStyle(selected.key);
      if (nextStyle !== state.frameStyle || !state.frameEnabled) {
        state.frameEnabled = true;
        state.frameStyle = nextStyle;
        markDirty();
        refreshScreen(`Frame: ${FRAME_STYLES[nextStyle].label}`);
      }
      renderMenu();
      return;
    }

    if (selected.type === 'wrapMode') {
      if (state.wrapMode !== selected.key) {
        state.wrapMode = selected.key;
        markDirty();
        refreshScreen(`Wrap: ${selected.key}`);
      }
      renderMenu();
      return;
    }

    if (selected.type === 'header') {
      if (HEADER_STYLES[selected.key]) {
        state.headerStyleKey = selected.key;
        markDirty();
        refreshScreen('Header style updated');
      }
      renderMenu();
      return;
    }

    if (selected.type === 'action' && selected.id === 'refresh') {
      state.generatedAt = new Date();
      markDirty();
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

  function buildHelpOverlay() {
    helpBox = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '70%',
      height: '50%',
      border: 'line',
      label: ' Help ',
      tags: true,
      keys: true,
      mouse: true,
      hidden: true,
      scrollable: true,
      alwaysScroll: true,
      scrollbar: { ch: ' ', inverse: true },
    });
  }

  function renderHelpOverlay() {
    if (!helpBox) return;
    const lines = [
      'Tab=Menu · F1=Help · F2=New · F4=Copy · F5=Print · F6=Save · F7=Load',
      '↑↓ select · Enter next · Shift+Enter newline · Backspace delete',
      'F8 open · F9 in progress · F10 done',
      'Brackets on/off · Frame on/off · Wrap mode/width/indent (Tab menu)',
      'ESC/F1 closes · Ctrl+C/Ctrl+Q exits',
    ];
    helpBox.setContent(lines.join('\n'));
    screen.render();
  }

  function openHelpOverlay() {
    if (!helpBox) buildHelpOverlay();
    helpOpen = true;
    helpBox.show();
    helpBox.focus();
    renderHelpOverlay();
    setStatus('Help');
    screen.render();
  }

  function closeHelpOverlay() {
    if (!helpOpen) return;
    helpOpen = false;
    if (helpBox) helpBox.hide();
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

    if (helpOpen) {
      if (key && (key.name === 'escape' || key.name === 'f1')) {
        closeHelpOverlay();
      }
      return;
    }

    if (key && key.name === 'f1') {
      closeMenu();
      closeLoadOverlay();
      openHelpOverlay();
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

    if (key && key.name === 'enter' && key.shift) {
      const todo = state.todos[state.activeIndex];
      todo.text = `${todo.text}\n`;
      markDirty();
      refreshScreen();
      return;
    }

    if (key && key.name === 'enter') {
      if (state.activeIndex === state.todos.length - 1 && state.todos.length < 50) {
        state.todos.push({ text: '', done: false });
        state.activeIndex = state.todos.length - 1;
        markDirty();
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
        markDirty();
        refreshScreen();
      }
      return;
    }

    if (key && ((key.name === 'v' && key.ctrl) || (key.name === 'insert' && key.shift))) {
      const res = await readClipboard();
      if (res.ok) {
        const todo = state.todos[state.activeIndex];
        todo.text = `${todo.text}${res.text}`;
        markDirty();
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
      markDirty();
      refreshScreen();
    }
  });

  refreshScreen(initialStatusMessage);
}

main();
