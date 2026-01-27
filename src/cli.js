#!/usr/bin/env node
'use strict';

const blessed = require('blessed');

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function renderTreePlan(n, currentIndex) {
  const activeIndex = clamp(currentIndex, 1, n);
  const lines = ['Actionplan:', '|', '|'];
  for (let i = 1; i <= n; i++) {
    const prefix = i === activeIndex ? '| ->' : '|    ';
    lines.push(`${prefix} Punkt ${i}`);
  }
  lines.push('|', '|');
  return lines.join('\n');
}

function osc52Copy(text) {
  const b64 = Buffer.from(text, 'utf8').toString('base64');
  process.stdout.write(`\u001b]52;c;${b64}\u0007`);
}

async function writeClipboard(text) {
  try {
    const mod = await import('clipboardy'); // ESM
    await mod.default.write(text);
    return { ok: true, mode: 'clipboardy' };
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
  let output;
  let resultBox;

  function decoratePlan(n, active) {
    const activeIndex = clamp(active, 1, n);
    const lines = ['Actionplan:', '|', '|'];
    for (let i = 1; i <= n; i++) {
      const isActive = i === activeIndex;
      const line = isActive
        ? '| {inverse}->{/inverse} Punkt ' + i
        : '|    Punkt ' + i;
      lines.push(line);
    }
    lines.push('|', '|');
    return lines.join('\n');
  }

  function updatePlan(reason = 'init') {
    planNormalized = renderTreePlan(total, currentIndex).replace(/\r\n/g, '\n');
    if (output) {
      output.setContent(decoratePlan(total, currentIndex));
      output.setScroll(0);
    }
    if (reason === 'current') {
      setStatus(`Current: ${currentIndex}/${total}`);
    } else {
      setStatus(
        `Generated plan: ${planNormalized.length} chars, ${total} items, current ${currentIndex}`,
      );
    }
  }

  async function copyPlan() {
    if (!planNormalized) return;
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
    if (!planNormalized) return;
    screen.destroy();
    process.stdout.write(planNormalized + '\n');
    process.exit(0);
  }

  function changeCurrent(delta) {
    if (!output || !total) return;
    const next = clamp(currentIndex + delta, 1, total);
    if (next !== currentIndex) {
      currentIndex = next;
      updatePlan('current');
    } else {
      setStatus(`Current: ${currentIndex}/${total}`);
    }
  }

  function destroyResult() {
    if (resultBox) {
      resultBox.destroy();
      resultBox = undefined;
      output = undefined;
    }
  }

  function restart() {
    destroyResult();
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

    // focus output so selection works
    output.focus();
    updatePlan('init');
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
