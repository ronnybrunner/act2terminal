#!/usr/bin/env node
'use strict';

const blessed = require('blessed');

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pad(num) {
  return num.toString().padStart(2, '0');
}

function formatHeader(generatedAt) {
  const year = generatedAt.getFullYear();
  const month = pad(generatedAt.getMonth() + 1);
  const day = pad(generatedAt.getDate());
  const hours = pad(generatedAt.getHours());
  const minutes = pad(generatedAt.getMinutes());
  return `Actionplan (${year}-${month}-${day} ${hours}:${minutes})`;
}

function renderTreePlan(items, currentIndex, generatedAt, forScreen) {
  const count = Math.max(items.length, 1);
  const activeIndex = clamp(currentIndex, 1, count);
  const header = `${formatHeader(generatedAt)}:`;

  const plainLines = [header, '|', '|'];
  const screenLines = [header, '|', '|'];

  for (let i = 1; i <= count; i++) {
    const text = items[i - 1]?.text ?? `Punkt ${i}`;
    const isActive = i === activeIndex;
    const plainPrefix = isActive ? '| ->' : '|    ';
    const screenPrefix = isActive && forScreen ? '| {inverse}->{/inverse} ' : '|    ';
    plainLines.push(`${plainPrefix} ${text}`);
    screenLines.push(`${screenPrefix}${text}`);
  }

  plainLines.push('|', '|');
  screenLines.push('|', '|');

  return {
    plain: plainLines.join('\n'),
    screen: screenLines.join('\n'),
  };
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
    title: 'Action Wizard',
    fullUnicode: true,
    dockBorders: true,
    mouse: true,
  });

  blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    height: 3,
    width: '100%',
    tags: true,
    content: ' {bold}Actionplan Wizard{/bold}  (ESC/q/Ctrl+C = Exit)',
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

  // Screen 1: ask count
  const form = blessed.form({
    parent: screen,
    top: 3,
    left: 'center',
    width: '80%',
    height: 9,
    border: 'line',
    label: ' Anzahl ',
    keys: true,
  });

  blessed.text({
    parent: form,
    top: 1,
    left: 2,
    content: 'Wie viele Punkte soll der Actionplan haben? (1..50)',
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

  // Screen 2: ask current index
  const formCurrent = blessed.form({
    parent: screen,
    top: 3,
    left: 'center',
    width: '80%',
    height: 9,
    border: 'line',
    label: ' Aktueller Punkt ',
    keys: true,
    hidden: true,
  });

  const currentQuestion = blessed.text({
    parent: formCurrent,
    top: 1,
    left: 2,
    content: 'Bei welchem Punkt arbeitest du gerade? (1..N)',
  });

  const currentInput = blessed.textbox({
    parent: formCurrent,
    top: 3,
    left: 2,
    width: 12,
    height: 3,
    border: 'line',
    inputOnFocus: true,
    value: '1',
  });

  const currentErrBox = blessed.box({
    parent: formCurrent,
    top: 6,
    left: 2,
    height: 1,
    width: '100%',
    tags: true,
    content: '',
  });

  const currentNextBtn = blessed.button({
    parent: formCurrent,
    top: 3,
    left: 16,
    width: 12,
    height: 3,
    content: ' Next ',
    border: 'line',
    mouse: true,
    keys: true,
  });

  let total = 0;
  let currentIndex = 1;
  let planNormalized = '';
  let items = [];
  let generatedAt = new Date();
  let output;
  let resultBox;
  let editor;

  function saveEditorValue() {
    if (!editor || !items.length) return;
    const idx = clamp(currentIndex, 1, items.length);
    items[idx - 1].text = editor.getValue() || '';
  }

  function refreshPlan(reason = 'init', message, options = {}) {
    if (!items.length) return;
    const rendered = renderTreePlan(items, currentIndex, generatedAt, true);
    planNormalized = rendered.plain.replace(/\r\n/g, '\n');
    if (output) {
      output.setContent(rendered.screen);
    }
    if (!options.skipStatus) {
      if (message) {
        setStatus(message);
      } else if (reason === 'current') {
        setStatus(`Current: ${currentIndex}/${items.length}`);
      } else {
        setStatus(
          `Generated plan: ${planNormalized.length} chars, ${items.length} items, current ${currentIndex}`,
        );
      }
    }
    screen.render();
  }

  async function copyPlan() {
    if (!items.length) return;
    saveEditorValue();
    refreshPlan('edit', undefined, { skipStatus: true });
    setStatus('Copying...');
    const res = await writeClipboard(planNormalized);
    if (res.ok) {
      setStatus('Copied ✓');
    } else {
      osc52Copy(planNormalized);
      setStatus('OSC52 fallback used');
    }
  }

  function printPlan() {
    if (!items.length) return;
    saveEditorValue();
    refreshPlan('edit', undefined, { skipStatus: true });
    screen.destroy();
    process.stdout.write(planNormalized + '\n');
    process.exit(0);
  }

  function changeCurrent(delta) {
    if (!output || !items.length) return;
    const next = clamp(currentIndex + delta, 1, items.length);
    if (next !== currentIndex) {
      saveEditorValue();
      currentIndex = next;
      if (editor) {
        editor.setValue(items[next - 1].text);
        editor.focus();
      }
      refreshPlan('current');
    } else {
      setStatus(`Current: ${currentIndex}/${items.length}`);
      screen.render();
    }
  }

  function destroyResult() {
    if (resultBox) {
      resultBox.destroy();
      resultBox = undefined;
      output = undefined;
      editor = undefined;
    }
  }

  function restart() {
    destroyResult();
    items = [];
    total = 0;
    currentIndex = 1;
    planNormalized = '';
    generatedAt = new Date();
    form.show();
    formCurrent.hide();
    input.setValue('');
    errBox.setContent('');
    currentInput.setValue('1');
    currentErrBox.setContent('');
    input.focus();
    setStatus('Ready.');
    screen.render();
  }

  function showResult(n) {
    form.hide();
    formCurrent.hide();

    destroyResult();

    total = n;
    items = Array.from({ length: n }, (_, i) => ({ text: `Punkt ${i + 1}` }));
    currentIndex = clamp(currentIndex, 1, total);

    // Screen 3: output + actions
    resultBox = blessed.box({
      parent: screen,
      top: 3,
      left: 'center',
      width: '90%',
      height: '80%',
      border: 'line',
      label: ' Output ',
    });

    output = blessed.box({
      parent: resultBox,
      top: 0,
      left: 0,
      width: '100%-2',
      height: '100%-7',
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
      top: '100%-7',
      left: 1,
      content: 'Edit current:',
    });

    editor = blessed.textbox({
      parent: resultBox,
      top: '100%-6',
      left: 1,
      width: '100%-2',
      height: 3,
      border: 'line',
      inputOnFocus: true,
      keys: true,
      mouse: true,
    });

    const bar = blessed.box({
      parent: resultBox,
      bottom: 0,
      left: 0,
      height: 3,
      width: '100%',
    });

    const copyBtn = blessed.button({
      parent: bar,
      left: 1,
      width: 12,
      height: 3,
      content: ' Copy ',
      border: 'line',
      mouse: true,
      keys: true,
    });

    const stdoutBtn = blessed.button({
      parent: bar,
      left: 14,
      width: 18,
      height: 3,
      content: ' Print stdout ',
      border: 'line',
      mouse: true,
      keys: true,
    });

    const restartBtn = blessed.button({
      parent: bar,
      left: 33,
      width: 12,
      height: 3,
      content: ' Restart ',
      border: 'line',
      mouse: true,
      keys: true,
    });

    const exitBtn = blessed.button({
      parent: bar,
      right: 1,
      width: 10,
      height: 3,
      content: ' Exit ',
      border: 'line',
      mouse: true,
      keys: true,
    });

    copyBtn.on('press', copyPlan);

    stdoutBtn.on('press', printPlan);

    restartBtn.on('press', restart);

    exitBtn.on('press', exit);

    editor.setValue(items[currentIndex - 1].text);

    editor.on('submit', () => {
      saveEditorValue();
      refreshPlan('edit', `Updated Punkt ${currentIndex}`);
    });

    editor.key(['C-v', 'S-insert'], async () => {
      const res = await readClipboard();
      if (res.ok) {
        const nextValue = (editor.getValue() || '') + res.text;
        editor.setValue(nextValue);
        saveEditorValue();
        refreshPlan('edit', 'Pasted from clipboard');
        editor.focus();
      } else {
        setStatus('Clipboard read failed; paste unavailable');
        screen.render();
      }
    });

    // focus editor by default
    editor.focus();
    refreshPlan('init');
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
    total = n;
    items = Array.from({ length: n }, (_, i) => ({ text: `Punkt ${i + 1}` }));
    currentQuestion.setContent(`Bei welchem Punkt arbeitest du gerade? (1..${n})`);
    currentInput.setValue('1');
    form.hide();
    formCurrent.show();
    currentInput.focus();
    screen.render();
  }

  function onNextCurrent() {
    const raw = (currentInput.getValue() || '').trim();
    const idx = Number(raw);
    if (!Number.isInteger(idx) || idx < 1 || idx > total) {
      currentErrBox.setContent(
        `{red-fg}Bitte eine Zahl von 1 bis ${total} eingeben.{/red-fg}`,
      );
      screen.render();
      return;
    }
    currentErrBox.setContent('');
    currentIndex = idx;
    generatedAt = new Date();
    showResult(total);
  }

  nextBtn.on('press', onNextCount);
  input.on('submit', onNextCount);

  currentNextBtn.on('press', onNextCurrent);
  currentInput.on('submit', onNextCurrent);

  screen.key(['up', 'k'], () => changeCurrent(-1));
  screen.key(['down', 'j'], () => changeCurrent(1));
  screen.key(['c'], () => copyPlan());
  screen.key(['p'], () => printPlan());
  screen.key(['r'], () => restart());

  input.focus();
  screen.render();
}

main();
