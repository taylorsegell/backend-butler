/** Real custom-card keyboard viewport geometry; synthetic HA/session, no microphone. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const esbuild = require('node:module').createRequire(require.resolve('vite/package.json'))('esbuild');

(async () => {
  const built = await esbuild.build({
    entryPoints: [path.join(__dirname, 'fixtures/keyboard-card.tsx')], bundle: true,
    write: false, format: 'iife', jsx: 'automatic', logLevel: 'silent',
    plugins: [{ name: 'synthetic-session', setup(build) {
      build.onResolve({ filter: /^@livekit\/components-react$/ }, () => ({ path: path.join(__dirname, 'fixtures/microphone-session.tsx') }));
    } }],
  });
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/fixture.js' ? 'text/javascript' : 'text/html');
    response.end(request.url === '/fixture.js' ? built.outputFiles[0].contents
      : '<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#181818;color:#eee}header{height:118px}backend-butler-card{display:block}</style><body><header></header><script src="/fixture.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const engine = process.env.ENGINE === 'webkit' ? webkit : chromium;
  let browser;
  try {
    browser = await engine.launch({ headless: true });
    const errors = [], measurements = [];
    for (const viewport of [{ width: 402, height: 874 }, { width: 320, height: 758 }]) {
      const page = await browser.newPage({ viewport });
      page.on('pageerror', error => errors.push(String(error)));
      await page.addInitScript(() => {
        const visual = new EventTarget();
        Object.assign(visual, { height: innerHeight, width: innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1 });
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: visual });
        window.keyboardViewport = visual;
      });
      const base = 'http://127.0.0.1:' + server.address().port;
      await page.goto(base);
      const card = page.locator('backend-butler-card');
      await page.getByRole('button', { name: 'Type instead', exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const initial = await card.boundingBox();
      const redundantCopy = /ready to talk|start the microphone when|speak naturally after|use the microphone to talk/i;
      assert.doesNotMatch(await card.locator('.lk-call').innerText(), redundantCopy);
      await page.getByRole('button', { name: 'Type instead', exact: true }).click();
      const input = page.getByRole('textbox', { name: 'Message Backend Butler', exact: true });
      assert.equal(await input.getAttribute('placeholder'), 'Message Butler…');
      assert.doesNotMatch(await card.locator('.lk-call').innerText(), redundantCopy);
      const empty = page.locator('.lk-call-transcript .lk-convo');
      const composer = await input.boundingBox();
      const logo = await empty.locator('svg[aria-hidden="true"]').boundingBox();
      const prompts = await empty.locator('.lk-starters').boundingBox();
      assert.ok(composer.height <= 44, `${viewport.width}: empty composer fits one line`);
      assert.ok(logo && logo.height >= 100 && Math.abs(logo.x + logo.width / 2 - viewport.width / 2) <= 1,
        `${viewport.width}: the existing Butler logo is centered in the empty transcript`);
      assert.ok(prompts && logo.y + logo.height <= prompts.y && prompts.y + prompts.height < composer.y,
        'the logo and suggestion buttons fit above the composer');
      const promptButtons = empty.locator('.lk-starters button');
      assert.equal(await promptButtons.count(), 3);
      for (const label of await promptButtons.all()) {
        const wordsPerLine = await label.evaluate(button => {
          const text = button.firstChild;
          const lines = new Map();
          for (const word of text.textContent.matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(text, word.index);
            range.setEnd(text, word.index + word[0].length);
            const top = range.getBoundingClientRect().top;
            lines.set(top, (lines.get(top) || 0) + 1);
          }
          return [...lines.values()];
        });
        assert.ok(wordsPerLine.length === 1 || wordsPerLine.at(-1) > 1, 'suggestions never leave a single trailing word');
      }
      const send = page.getByRole('button', { name: 'Send', exact: true });
      assert.ok(await send.isDisabled());
      const inactive = await send.evaluate(button => getComputedStyle(button).backgroundColor);
      await promptButtons.first().click();
      assert.equal(await input.inputValue(), 'Which lights are on?');
      assert.ok(await send.isEnabled());
      await page.waitForFunction(color => getComputedStyle(window.keyboardCard.shadowRoot.querySelector('.lk-send')).backgroundColor !== color, inactive);
      const sendColor = await send.evaluate(button => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.fillStyle = getComputedStyle(button).backgroundColor;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      });
      assert.ok(Math.max(...sendColor) - Math.min(...sendColor) < 25, `enabled Send stays neutral: ${sendColor}`);
      const history = Array.from({ length: 24 }, (_, i) => ({ kind: 'message', id: 'message-' + i,
        role: i % 2 ? 'agent' : 'user', text: 'A synthetic saved conversation message ' + i, ts: i + 1 }));
      await page.evaluate(items => window.emitConversation(items), history);
      await page.getByRole('button', { name: 'Live view', exact: true }).click();
      await page.getByRole('button', { name: 'Type instead', exact: true }).click();
      await page.waitForFunction(() => {
        const host = window.keyboardCard;
        return host.shadowRoot.activeElement === host.shadowRoot.querySelector('textarea');
      });
      await input.fill('Keep this unsent draft.');
      const transcript = page.locator('.lk-call-transcript .lk-convo');
      await transcript.evaluate(el => { el.scrollTop = 80; });
      const beforeHistory = await transcript.textContent();
      const beforeScroll = await transcript.evaluate(el => el.scrollTop);
      const read = () => card.evaluate(host => {
        const box = selector => host.shadowRoot.querySelector(selector).getBoundingClientRect().toJSON();
        return { root: box('.lk-root'), input: box('textarea'), send: box('.lk-send'),
          host: host.getBoundingClientRect().toJSON(), visual: { top: visualViewport.offsetTop, bottom: visualViewport.offsetTop + visualViewport.height },
          scroll: scrollY, keyboard: host.hasAttribute('data-keyboard') };
      });
      const geometry = [];
      for (const state of [
        { height: 430, offsetTop: 0, scroll: 0 },
        { height: 430, offsetTop: 300, scroll: 0 },
        { height: 430, offsetTop: 100, scroll: 220 },
      ]) {
        await page.evaluate(state => {
          document.documentElement.style.minHeight = '1400px';
          window.scrollTo(0, state.scroll);
          Object.assign(window.keyboardViewport, { height: state.height, offsetTop: state.offsetTop });
          window.keyboardViewport.dispatchEvent(new Event('resize'));
          window.keyboardViewport.dispatchEvent(new Event('scroll'));
        }, state);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const measured = await read();
        geometry.push({ state, measured });
        for (const target of ['input', 'send']) {
          assert.ok(measured[target].top >= measured.visual.top - 1 && measured[target].bottom <= measured.visual.bottom + 1,
            `${viewport.width}/${target}: typing stays above the keyboard: ${JSON.stringify(measured)}`);
        }
        assert.ok(Math.abs(measured.root.bottom - measured.visual.bottom) <= 1,
          'the active card reaches the keyboard without a blank viewport gap');
        assert.equal(measured.scroll, state.scroll, 'card layout never resets Home Assistant page scrolling');
        assert.ok(measured.send.width >= 44 && measured.send.height >= 44);
        assert.equal(await input.inputValue(), 'Keep this unsent draft.');
        assert.equal(await transcript.textContent(), beforeHistory, 'viewport changes preserve saved conversation content');
        assert.ok(Math.abs(await transcript.evaluate(el => el.scrollTop) - beforeScroll) <= 1, 'keyboard layout preserves the earlier reading position');
      }
      const captures = path.join(process.env.ARTIFACTS_DIR || '/tmp/butler-keyboard-captures', engine.name());
      fs.mkdirSync(captures, { recursive: true });
      await page.screenshot({ path: path.join(captures, `${viewport.width}-keyboard.png`) });
      // Dismissal restores the normal full-page surface, without unmounting history/draft.
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        Object.assign(window.keyboardViewport, { height: innerHeight, offsetTop: 0 });
        window.keyboardViewport.dispatchEvent(new Event('resize'));
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const restored = await card.boundingBox();
      assert.ok(Math.abs(restored.height - initial.height) <= 1 && Math.abs(restored.y - initial.y) <= 1,
        'keyboard dismissal restores full-page geometry');
      assert.equal(await card.getAttribute('data-keyboard'), null);
      assert.equal(await input.evaluate(el => el.getRootNode().activeElement === el), true,
        'keyboard dismissal restores layout even when iOS keeps the field focused');
      assert.equal(await input.inputValue(), 'Keep this unsent draft.');
      assert.equal(await transcript.textContent(), beforeHistory);
      assert.ok(Math.abs(await transcript.evaluate(el => el.scrollTop) - beforeScroll) <= 1,
        'keyboard dismissal restores the earlier reading position');
      // Ordinary scroll and pinch zoom must not activate keyboard anchoring.
      await page.evaluate(() => window.scrollTo(0, 220));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await card.getAttribute('data-keyboard'), null);
      assert.ok((await card.boundingBox()).height <= viewport.height, 'ordinary scrolling stays bounded');
      await page.setViewportSize({ width: viewport.width, height: viewport.height - 120 });
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        Object.assign(window.keyboardViewport, { height: innerHeight, offsetTop: 0 });
        window.keyboardViewport.dispatchEvent(new Event('resize'));
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await card.getAttribute('data-keyboard'), null, 'normal window resizing is not a keyboard');
      assert.ok((await card.boundingBox()).height <= viewport.height - 120, 'window resize updates normal flow height');
      await page.setViewportSize(viewport);
      await page.evaluate(() => {
        Object.assign(window.keyboardViewport, { height: 430, offsetTop: 100, scale: 2 });
        window.keyboardViewport.dispatchEvent(new Event('resize'));
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await card.getAttribute('data-keyboard'), null, 'pinch zoom is not treated as a keyboard');
      // Direct field focus also follows the keyboard, and blur clears compensation.
      await input.evaluate(el => el.blur());
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        Object.assign(window.keyboardViewport, { height: innerHeight, offsetTop: 0, scale: 1 });
        window.keyboardViewport.dispatchEvent(new Event('resize'));
      });
      await input.focus();
      await page.evaluate(() => {
        Object.assign(window.keyboardViewport, { height: 430, offsetTop: 100 });
        window.keyboardViewport.dispatchEvent(new Event('resize'));
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const direct = await read();
      assert.ok(direct.input.top >= direct.visual.top && direct.input.bottom <= direct.visual.bottom);
      await page.getByRole('button', { name: 'Live view', exact: true }).focus();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await card.getAttribute('data-keyboard'), null, 'moving focus away clears keyboard anchoring');
      assert.equal(await page.evaluate(() => window.captureRequests), 0);
      assert.equal(await page.evaluate(() => window.sessionStarts), 0);
      measurements.push({ viewport, initial, geometry, restored });
      fs.writeFileSync(path.join(captures, 'metrics.json'), JSON.stringify(measurements, null, 2));
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
    page.on('pageerror', error => errors.push(String(error)));
    await page.addInitScript(() => {
      const visual = new EventTarget();
      Object.assign(visual, { height: innerHeight, width: innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1 });
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: visual });
      window.keyboardViewport = visual;
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/?shadow=1');
    await page.getByRole('button', { name: 'Type instead', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Message Backend Butler', exact: true });
    await input.fill('A draft inside Home Assistant’s shadow scroller.');
    await page.evaluate(() => {
      Object.assign(window.keyboardViewport, { height: 430, offsetTop: 100 });
      window.keyboardViewport.dispatchEvent(new Event('resize'));
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    // No visualViewport/window event: HA's non-composed ancestor scroll owns this movement.
    await page.evaluate(() => { window.shadowScroller.scrollTop = 220; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const shadowGeometry = await input.boundingBox();
    assert.ok(shadowGeometry.y >= 100 && shadowGeometry.y + shadowGeometry.height <= 530,
      'ancestor shadow scrolling keeps the composer visible without viewport events');
    const rootTop = await page.locator('.lk-root').evaluate(el => el.getBoundingClientRect().top);
    assert.ok(rootTop >= 118, 'keyboard content respects the actual HA ancestor clipping edge');
    await page.goto('http://127.0.0.1:' + server.address().port + '/?layout=card');
    await page.getByRole('button', { name: 'Type instead', exact: true }).click();
    await page.getByRole('textbox', { name: 'Message Backend Butler', exact: true }).fill('An embedded card stays embedded.');
    const embeddedBefore = await page.locator('backend-butler-card').boundingBox();
    await page.evaluate(() => {
      Object.assign(window.keyboardViewport, { height: 430, offsetTop: 100 });
      window.keyboardViewport.dispatchEvent(new Event('resize'));
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('backend-butler-card').getAttribute('data-keyboard'), null);
    assert.deepEqual(await page.locator('backend-butler-card').boundingBox(), embeddedBefore, 'embedded card geometry is unaffected by full-page keyboard logic');
    await page.close();
    assert.deepEqual(errors, []);
    console.log('PASS: real card keeps Type instead composer and Send within keyboard viewport through pan/scroll; restores layout without capture or history loss');
  } finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exit(1); });
