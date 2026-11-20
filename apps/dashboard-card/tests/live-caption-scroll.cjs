/** Real Live UI with a synthetic conversation; no microphone or household API. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const esbuild = require('node:module').createRequire(require.resolve('vite/package.json'))('esbuild');

(async () => {
  const built = await esbuild.build({
    entryPoints: [path.join(__dirname, 'fixtures/microphone-card.tsx')], bundle: true,
    write: false, format: 'iife', jsx: 'automatic', logLevel: 'silent',
    plugins: [...(process.env.BASELINE_LIVE ? [{ name: 'baseline-live', setup(build) {
      build.onLoad({ filter: /\/src\/components\/LiveCall\.tsx$/ }, args => ({ contents: fs.readFileSync(process.env.BASELINE_LIVE, 'utf8'), loader: 'tsx', resolveDir: path.dirname(args.path) }));
    } }] : []), { name: 'synthetic-session', setup(build) {
      build.onResolve({ filter: /^@livekit\/components-react$/ }, () => ({ path: path.join(__dirname, 'fixtures/microphone-session.tsx') }));
    } }],
  });
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/fixture.js' ? 'text/javascript' : 'text/html');
    response.end(request.url === '/fixture.js' ? built.outputFiles[0].contents : '<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#181818;color:#eee}</style><body><script src="/fixture.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const engine = process.env.ENGINE === 'webkit' ? webkit : chromium;
  let browser;
  try {
    browser = await engine.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => { errors.push(String(error)); console.error(error); });
    await page.goto('http://127.0.0.1:' + server.address().port + '/?mode=default');
    await page.getByRole('button', { name: 'Start call', exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    // Leave the same vertical room as the Companion navigation above the card.
    await page.evaluate(() => {
      const header = document.createElement('header'); header.style.height = '118px';
      document.body.prepend(header);
      document.querySelector('body > div').style.height = 'calc(100dvh - 118px)';
    });
    const captions = page.locator('.lk-call-captions');
    const reply = page.locator('.lk-call-reply');
    const intro = 'I have saved your preference. ';
    const body = 'You can ask for your favorite lighting whenever you need it, and I can help you adjust the room afterward. '.repeat(12);
    const ending = 'These are the latest words.';
    let text = intro + body + ending;
    const emit = async (answer, user = 'Please remember my lighting preference.') => page.evaluate(({ answer, user }) => {
      window.emitConversation([
        { kind: 'message', id: 'caption-user', role: 'user', text: user, ts: 1 },
        ...(answer ? [{ kind: 'message', id: 'caption-reply', role: 'agent', text: answer, ts: 2 }] : []),
      ]);
    }, { answer, user });
    const checkTail = async () => {
      await page.waitForFunction(() => {
        const el = document.querySelector('body > div')?.shadowRoot?.querySelector('.lk-call-captions');
        return el && el.clientHeight > 0 && el.scrollHeight - el.clientHeight - el.scrollTop < 2;
      });
      const geometry = await captions.evaluate(el => {
        const node = el.querySelector('.lk-call-reply').firstChild;
        const range = document.createRange();
        range.setStart(node, Math.max(0, node.length - 20)); range.setEnd(node, node.length);
        const tail = range.getBoundingClientRect(), viewport = el.getBoundingClientRect();
        return { tailTop: tail.top, tailBottom: tail.bottom, top: viewport.top, bottom: viewport.bottom, height: viewport.height };
      });
      assert.ok(geometry.tailTop >= geometry.top - 1 && geometry.tailBottom <= geometry.bottom + 1, JSON.stringify(geometry));
      const controls = await page.locator('.lk-call-controls').boundingBox();
      assert.ok(controls.y + controls.height <= page.viewportSize().height, 'controls stay in the phone frame');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    };
    await emit(text);
    await reply.getByText(text, { exact: true }).waitFor();
    await checkTail();
    assert.ok(await captions.evaluate(el => el.scrollTop > 0), 'long replies move upward');
    assert.equal(await reply.textContent(), text, 'the full answer remains in the DOM');
    await captions.evaluate(el => { el.scrollTop = 0; });
    assert.equal(await captions.evaluate(el => el.scrollTop), 0, 'earlier text remains scrollable');
    text += ' Newly streamed words stay visible too.';
    await emit(text);
    await reply.getByText(text, { exact: true }).waitFor();
    await checkTail();
    await page.getByRole('button', { name: 'Transcript', exact: true }).click();
    await page.getByRole('button', { name: 'Live view', exact: true }).click();
    await checkTail();
    // Text reflow alone must keep the end in frame without a new transcript event.
    await reply.evaluate(el => { el.style.fontSize = '50px'; });
    await checkTail();
    await reply.evaluate(el => { el.style.fontSize = ''; });
    for (const size of [{ width: 320, height: 568 }, { width: 768, height: 900 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(size); await checkTail();
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    text += ' Reduced motion still follows the current text.';
    await emit(text); await checkTail();
    await page.setViewportSize({ width: 402, height: 874 });
    const captures = process.env.ARTIFACTS_DIR || '/tmp/butler-live-caption-captures';
    fs.mkdirSync(captures, { recursive: true });
    await page.screenshot({ path: path.join(captures, 'phone-long-reply.png') });
    await emit('Saved.'); await reply.getByText('Saved.', { exact: true }).waitFor();
    await checkTail();
    assert.equal(await captions.evaluate(el => el.scrollTop), 0, 'a short next reply starts at the top');
    await emit(null, 'A new question.');
    await reply.getByText('Waiting for Butler’s reply…', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.captureRequests), 0, 'caption updates never open the microphone');
    assert.deepEqual(errors, []);
    console.log('PASS: complete Live captions follow streamed text, reflow, resize and view changes; earlier text scrolls; controls remain visible; no microphone capture');
  } finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exit(1); });
