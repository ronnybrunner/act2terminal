#!/usr/bin/env node
'use strict';

const blessed = require('blessed');

function buildPlan(n) {
  const lines = [];
  lines.push('Actionplan');
  lines.push('');
  for (let i = 1; i <= n; i++) lines.push(`${i}. [ ] Punkt ${i}`);
  lines.push('');
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

  function showResult(n) {
    form.hide();

    const plan = buildPlan(n);

    // Screen 2: output + actions
    const resultBox = blessed.box({
      parent: screen,
      top: 3,
      left: 'center',
      width: '90%',
      height: '80%',
      border: 'line',
      label: ' Output ',
    });

    const textArea = blessed.textarea({
      parent: resultBox,
      top: 0,
      left: 0,
      width: '100%-2',
      height: '100%-4',
      border: 'line',
      keys: true,
      mouse: true,
      vi: true,
      scrollbar: { ch: ' ', inverse: true },
      content: plan,
    });

    // readonly-ish: prevent edits
    textArea.readOnly = true;

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

    copyBtn.on('press', async () => {
      setStatus('Copying...');
      const res = await writeClipboard(plan);
      if (res.ok) {
        setStatus('Copied ✓');
      } else {
        osc52Copy(plan);
        setStatus('OSC52 fallback used');
      }
    });

    stdoutBtn.on('press', () => {
      // Print AFTER UI exits so it doesn't mess up the screen
      screen.destroy();
      process.stdout.write(plan + '\n');
      process.exit(0);
    });

    restartBtn.on('press', () => {
      resultBox.destroy();
      form.show();
      input.setValue('');
      errBox.setContent('');
      input.focus();
      setStatus('Ready.');
      screen.render();
    });

    exitBtn.on('press', exit);

    // focus output so selection works
    textArea.focus();
    screen.render();
  }

  function onNext() {
    const raw = (input.getValue() || '').trim();
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      errBox.setContent('{red-fg}Bitte eine Zahl von 1 bis 50 eingeben.{/red-fg}');
      screen.render();
      return;
    }
    errBox.setContent('');
    showResult(n);
  }

  nextBtn.on('press', onNext);
  input.on('submit', onNext);

  input.focus();
  screen.render();
}

main();
