/** Real call presentation at phone widths; no household API or microphone. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const esbuild = require('node:module').createRequire(require.resolve('vite/package.json'))('esbuild');

(async () => {
  const built = await esbuild.build({
    entryPoints: [path.join(__dirname, 'fixtures/call-recovery-ui.tsx')], bundle: true,
    write: false, format: 'iife', jsx: 'automatic', logLevel: 'silent',
  });
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/fixture.js' ? 'text/javascript' : 'text/html');
    response.end(request.url === '/fixture.js' ? built.outputFiles[0].contents
      : '<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#181818;color:#eee}header{height:118px}</style><body><header></header><script src="/fixture.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const engine = process.env.ENGINE === 'webkit' ? webkit : chromium;
    browser = await engine.launch({ headless: true });
    const errors = [];
    for (const viewport of [{ width: 402, height: 874 }, { width: 320, height: 758 }]) {
      const page = await browser.newPage({ viewport });
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto('http://127.0.0.1:' + server.address().port);
      const input = page.getByRole('textbox', { name: 'Message Backend Butler', exact: true });
      const send = page.getByRole('button', { name: 'Send', exact: true });
      await input.waitFor();
      await page.evaluate(() => document.fonts.ready);
      const empty = await input.evaluate(el => ({ height: el.clientHeight, value: el.value,
        scroll: el.scrollHeight, label: el.getAttribute('aria-label') }));
      assert.equal(empty.value, '');
      assert.ok(empty.height <= 44 && empty.scroll <= empty.height + 1,
        `${viewport.width}: an empty composer remains one readable line: ${JSON.stringify(empty)}`);
      assert.equal(await send.isDisabled(), true);
      const inactive = await send.evaluate(el => getComputedStyle(el).backgroundColor);
      await input.fill('A typed reply that is ready to send.');
      assert.equal(await send.isEnabled(), true);
      await page.waitForFunction(color => {
        const button = document.querySelector('body > div').shadowRoot.querySelector('.lk-send');
        return getComputedStyle(button).backgroundColor !== color;
      }, inactive);
      const active = await send.evaluate(el => getComputedStyle(el).backgroundColor);
      assert.notEqual(inactive, active, 'disabled Send has a distinct inactive surface');
      await input.fill('This is a longer draft with several lines that must remain editable and visible. '.repeat(5));
      await page.waitForFunction(minimum => {
        const el = document.querySelector('body > div').shadowRoot.querySelector('textarea');
        return el.clientHeight > minimum;
      }, empty.height + 16);
      assert.ok(await input.evaluate(el => el.clientHeight <= 128), 'long drafts grow within the scrollable composer limit');
      await input.fill('');
      await page.evaluate(() => window.showRecovery(true));
      const recovery = page.getByRole('region', { name: 'Connection recovery', exact: true });
      await recovery.waitFor();
      const explanation = 'Your conversation is still here. Retry the connection or type a message.';
      assert.equal(await page.getByText(explanation, { exact: true }).count(), 1, 'one recovery explanation');
      assert.equal(await page.locator('.lk-call-status').count(), 0, 'recovery owns error presentation');
      assert.equal(await recovery.getByRole('alert').count(), 1);
      await recovery.getByRole('heading', { name: 'Voice session couldn’t connect', exact: true }).waitFor();
      const geometry = await page.locator('ha-card').evaluate(el => {
        const box = target => target.getBoundingClientRect().toJSON();
        return { card: box(el), transcript: box(el.querySelector('.lk-convo')),
          controls: [...el.querySelectorAll('.lk-call-control')].map(box),
          recovery: box(el.querySelector('.lk-recovery')), notices: box(el.querySelector('.lk-call-notices')),
          composer: box(el.querySelector('.lk-bar')) };
      });
      assert.ok(geometry.transcript.height >= 120, `${viewport.width}: recovery retains readable transcript space: ${JSON.stringify(geometry)}`);
      for (const box of geometry.controls) {
        assert.ok(box.width >= 44 && box.height >= 44, 'voice controls retain touch targets');
        assert.ok(box.y + box.height <= geometry.card.y + geometry.card.height + 1, 'controls remain in the phone frame');
      }
      assert.ok(geometry.recovery.bottom <= geometry.notices.bottom + 1, 'the compact recovery and its actions fit without clipping');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await input.focus();
      await page.keyboard.type('A preserved draft.');
      await page.getByRole('button', { name: 'Live view', exact: true }).click();
      await page.getByRole('button', { name: 'Transcript', exact: true }).click();
      assert.equal(await input.inputValue(), 'A preserved draft.', 'view changes retain the typed draft');
      await input.fill('');
      await page.waitForFunction(color => {
        const button = document.querySelector('body > div').shadowRoot.querySelector('.lk-send');
        return getComputedStyle(button).backgroundColor === color;
      }, inactive);
      await input.evaluate(el => el.blur());
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const captures = process.env.ARTIFACTS_DIR || '/tmp/butler-call-recovery-captures';
      fs.mkdirSync(captures, { recursive: true });
      await page.screenshot({ path: path.join(captures, `${viewport.width}-recovery.png`) });
      fs.writeFileSync(path.join(captures, `${viewport.width}-metrics.json`), JSON.stringify({ empty, geometry, inactive, active }, null, 2));
      await recovery.getByRole('button', { name: 'Retry voice', exact: true }).click();
      await page.getByText('Ready to talk', { exact: true }).waitFor();
      assert.equal(await recovery.count(), 0, 'successful retry removes the recovery notice');
      await page.close();
    }
    assert.deepEqual(errors, []);
    console.log('PASS: compact empty composer, editable multiline drafts, distinct disabled Send, single recovery, preserved transcript and phone controls');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exit(1); });
