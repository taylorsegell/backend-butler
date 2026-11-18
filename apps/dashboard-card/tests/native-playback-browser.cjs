const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ts = require('typescript');

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/native-reply-player.ts'), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText;
    await page.addScriptTag({ content: 'window.exports = {};\n' + source });
    await page.evaluate(async () => {
      const player = new exports.ReplyPlayer();
      window.player = player;
      window.finished = [];
      player.onFinished = segment => window.finished.push(segment);
      await player.unlock();
      const samples = new Int16Array(12000); // half a second of synthetic audio
      for (let n = 0; n < samples.length; n++) samples[n] = Math.round(1000 * Math.sin(n / 12));
      let raw = '';
      for (const byte of new Uint8Array(samples.buffer)) raw += String.fromCharCode(byte);
      window.frame = { pcm: btoa(raw), sample_rate: 24000, channels: 1 };
      player.push(frame);
      player.finish(1);
    });
    assert.deepEqual(await page.evaluate(() => finished), []);
    await page.waitForFunction(() => finished.length === 1);
    assert.deepEqual(await page.evaluate(() => finished), [1]);
    await page.evaluate(() => {
      player.push(frame); player.finish(2); player.muted = true; player.stop();
    });
    assert.deepEqual(await page.evaluate(() => finished), [1, 2]);
    await page.evaluate(() => { player.push(frame); player.finish(3); });
    assert.deepEqual(await page.evaluate(() => finished), [1, 2, 3]);
    await page.evaluate(() => player.close());
    assert.deepEqual(errors, []);
    console.log('PASS: real Chromium AudioContext completion, local mute, and muted replies');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
