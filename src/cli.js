#!/usr/bin/env node
'use strict';

const blessed = require('blessed');

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

function renderPlain(todos, generatedAt) {
  const header = `# Todos (${formatDate(generatedAt)})`;
  const lines = todos.map((todo) => {
    const box = todo.done ? '[x]' : '[ ]';
    const text = todo.text ? ` ${todo.text}` : '';
    return `${box}${text}`;
  });
  return [header, ...lines].join('\n');
}

function renderScreen(todos, activeIndex, generatedAt) {
  const header = `# Todos (${formatDate(generatedAt)})`;
  const lines = todos.map((todo, idx) => {
    const box = todo.done ? '[x]' : '[ ]';
    const hasText = Boolean(todo.text && todo.text.trim() !== '');
    const text = hasText ? todo.text : '{gray-fg}<enter todo…>{/gray-fg}';
    const marker = idx === activeIndex ? '▸' : ' ';
    const line = `${marker} ${box} ${text}`;
    return idx === activeIndex ? `{inverse}${line}{/inverse}` : line;
  });
  return [header, ...lines].join('\n');
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
    title: 'Todo Checklist',
    fullUnicode: true,
    dockBorders: true,
    mouse: true,
  });

  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    height: 3,
    width: '100%',
    tags: true,
    content: ' {bold}Todo Checklist{/bold}  F4=Copy, Space=Done, Enter=Save, ↑↓=Select (ESC/q/Ctrl+C = Exit)',
    border: 'line',
  });

  const status = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    height: 3,
    width: '100%',
    tags: true,
    content: ' Ready.',
    border: 'line',
  });

  function setStatus(msg) {
    status.setContent(` ${msg}`);
    screen.render();
  }

  function exit() {
    screen.destroy();
    process.exit(0);
  }

  screen.key(['escape', 'q', 'C-c'], exit);

  const form = blessed.form({
    parent: screen,
    top: header.height,
    left: 'center',
    width: '80%',
    height: 9,
    border: 'line',
    label: ' Anzahl Todos ',
    keys: true,
  });

  blessed.text({
    parent: form,
    top: 1,
    left: 2,
    content: 'Wie viele Todos? (1..50)',
  });

  const input = blessed.textbox({
    parent: form,
    top: 3,
    left: 2,
    width: 12,
    height: 3,
    border: 'line',
    inputOnFocus: true,
  });

  const errBox = blessed.box({
    parent: form,
    top: 6,
    left: 2,
    height: 1,
    width: '100%',
    tags: true,
    content: '',
  });

  const nextBtn = blessed.button({
    parent: form,
    top: 3,
    left: 16,
    width: 12,
    height: 3,
    content: ' Next ',
    border: 'line',
    mouse: true,
    keys: true,
  });

  let todos = [];
  let activeIndex = 0;
  let generatedAt = new Date();
  let resultBox;
  let listBox;
  let editor;

  function buildEditorUI() {
    if (resultBox) return;
    resultBox = blessed.box({
      parent: screen,
      top: header.height,
      left: 'center',
      width: '90%',
      height: '80%',
      border: 'line',
      label: ' Todos ',
      hidden: true,
    });

    listBox = blessed.box({
      parent: resultBox,
      top: 0,
      left: 0,
      width: '100%-2',
      height: '100%-6',
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
      parent: resultBox,
      top: '100%-6',
      left: 1,
      content: 'Edit:',
    });

    editor = blessed.textbox({
      parent: resultBox,
      top: '100%-5',
      left: 1,
      width: '100%-2',
      height: 3,
      border: 'line',
      inputOnFocus: true,
      keys: true,
      mouse: true,
    });

    editor.on('submit', () => {
      saveEditorValue();
      refreshTodos('edit', `Saved Todo ${activeIndex + 1}`);
    });

    editor.key(['C-v', 'S-insert'], async () => {
      const res = await readClipboard();
      if (res.ok) {
        const nextValue = (editor.getValue() || '') + res.text;
        editor.setValue(nextValue);
        saveEditorValue();
        refreshTodos('edit', 'Pasted from clipboard');
        editor.focus();
      } else {
        setStatus('Clipboard read failed; paste unavailable');
        screen.render();
      }
    });
  }

  function saveEditorValue() {
    if (!editor || !todos.length) return;
    todos[activeIndex].text = editor.getValue() || '';
  }

  function refreshTodos(reason = 'init', message) {
    if (!listBox || !todos.length) return;
    const screenText = renderScreen(todos, activeIndex, generatedAt);
    listBox.setContent(screenText);
    if (message) {
      setStatus(message);
    } else if (reason === 'current') {
      setStatus(`Aktiv: ${activeIndex + 1}/${todos.length}`);
    } else {
      setStatus(`Todos: ${todos.length}, aktiv ${activeIndex + 1}`);
    }
    screen.render();
  }

  function changeActive(delta) {
    if (!todos.length) return;
    saveEditorValue();
    const next = clamp(activeIndex + delta, 0, todos.length - 1);
    if (next !== activeIndex) {
      activeIndex = next;
      if (editor) {
        editor.setValue(todos[activeIndex].text);
        editor.focus();
      }
      refreshTodos('current');
    } else {
      setStatus(`Aktiv: ${activeIndex + 1}/${todos.length}`);
    }
  }

  function toggleActiveDone() {
    if (!todos.length) return;
    saveEditorValue();
    todos[activeIndex].done = !todos[activeIndex].done;
    refreshTodos('toggle', todos[activeIndex].done ? 'Marked done' : 'Marked open');
  }

  async function copyTodos() {
    if (!todos.length) return;
    saveEditorValue();
    const plain = renderPlain(todos, generatedAt);
    const res = await writeClipboard(plain);
    if (res.ok) {
      setStatus('Copied ✓ (F4)');
    } else {
      osc52Copy(plain);
      setStatus('Clipboard failed → OSC52 ✓');
    }
    screen.render();
  }

  function printTodos() {
    if (!todos.length) return;
    saveEditorValue();
    const plain = renderPlain(todos, generatedAt);
    screen.destroy();
    process.stdout.write(plain + '\n');
    process.exit(0);
  }

  function restart() {
    saveEditorValue();
    todos = [];
    activeIndex = 0;
    generatedAt = new Date();
    if (resultBox) {
      resultBox.hide();
    }
    form.show();
    input.setValue('');
    errBox.setContent('');
    input.focus();
    setStatus('Ready.');
    screen.render();
  }

  function showTodos(count) {
    buildEditorUI();
    todos = Array.from({ length: count }, () => ({ text: '', done: false }));
    activeIndex = 0;
    generatedAt = new Date();
    form.hide();
    if (resultBox) {
      resultBox.show();
    }
    if (editor) {
      editor.setValue('');
      editor.focus();
    }
    refreshTodos('init', `Todos bereit (${count})`);
  }

  function onNextCount() {
    const raw = (input.getValue() || '').trim();
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      errBox.setContent('{red-fg}Bitte eine Zahl von 1 bis 50 eingeben.{/red-fg}');
      screen.render();
      return;
    }
    errBox.setContent('');
    showTodos(n);
  }

  nextBtn.on('press', onNextCount);
  input.on('submit', onNextCount);

  screen.key(['up', 'k'], () => changeActive(-1));
  screen.key(['down', 'j'], () => changeActive(1));
  screen.key(['space'], () => toggleActiveDone());
  screen.key(['f4'], () => {
    copyTodos();
  });
  screen.key(['f5'], () => {
    printTodos();
  });
  screen.key(['r'], () => restart());

  input.focus();
  screen.render();
}

main();
