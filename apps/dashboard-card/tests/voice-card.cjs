const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const engine = process.env.ENGINE || 'chromium';
const bundle = path.resolve(__dirname, '../../../custom_components/backend_butler/frontend/backend-butler-card.js');
const artifacts = process.env.ARTIFACTS_DIR;
const tokenRequests = [];
const tokenEvents = new EventEmitter();
const nextToken = async () => {
  const [reply] = await once(tokenEvents, 'token', { signal: AbortSignal.timeout(10000) });
  return reply;
};

const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin: 16px; background: #181818; color: #eee; }
  main { max-width: 520px; }
  main.light { --card-background-color: #fff; --primary-text-color: #202124; --secondary-text-color: #555; }
  .neighbor { margin-block-start: 12px; }
</style>
<main><div class="neighbor">Next dashboard card</div></main>
<script type="module">
  window.captureRequests = 0;
  window.tokenResponses = 0;
  const devices = navigator.mediaDevices;
  const getUserMedia = () => {
    window.captureRequests++;
    return new Promise(() => {});
  };
  Object.defineProperty(Object.getPrototypeOf(devices), 'getUserMedia', { configurable: true, writable: true, value: getUserMedia });
  Object.defineProperty(devices, 'getUserMedia', { configurable: true, writable: true, value: getUserMedia });
  await import('/card.js');
  const options = new URLSearchParams(location.search);
  const layout = options.get('layout') || 'voice';
  const type = layout === 'voice' && !options.has('alias') ? 'backend-butler-voice-card' : 'backend-butler-card';
  const main = document.querySelector('main');
  if (options.has('light')) main.classList.add('light');
  const card = document.createElement(type);
  card.setConfig({
    type: 'custom:' + type,
    layout,
    ...(layout === 'voice'
      ? {title: 'Talk to Butler', height: 640, auto_connect: true, start_on_connect: true}
      : {})
  });
  card.hass = {
    states: {}, user: {id: 'fixture', is_admin: true}, callWS: async () => [],
    callService: async () => {},
    callApi: async (method, apiPath, body) => {
      if (layout !== 'voice' && apiPath.endsWith('/token')) {
        return {serverUrl: location.origin.replace('http', 'ws'), participantToken: ''};
      }
      const response = await fetch('/api/' + apiPath, {method, body: body ? JSON.stringify(body) : undefined});
      if (apiPath.endsWith('/token')) window.tokenResponses++;
      if (!response.ok) throw {status_code: response.status};
      return response.json();
    }
  };
  main.prepend(card);
</script>`;

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') {
    res.setHeader('Content-Type', 'text/html');
    return res.end(html);
  }
  if (pathname === '/card.js') {
    res.setHeader('Content-Type', 'text/javascript');
    return res.end(fs.readFileSync(bundle));
  }
  res.setHeader('Content-Type', 'application/json');
  if (pathname.endsWith('/token')) {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      tokenRequests.push(JSON.parse(Buffer.concat(chunks).toString()));
      tokenEvents.emit('token', () => {
        res.statusCode = 503;
        res.end('{}');
      });
    });
    return;
  }
  return res.end(pathname.endsWith('/tasks') ? '{"tasks":[]}' : '{"items":[]}');
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await (engine === 'webkit' ? webkit : chromium).launch({
      headless: true, args: engine === 'chromium' ? ['--no-sandbox'] : [],
    });
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => {
      errors.push(String(error));
      console.error('Card fixture page error:', error);
    });
    const card = page.locator('ha-card');
    const start = card.getByRole('button', { name: 'Start call', exact: true });
    const cancel = card.getByRole('button', { name: 'Cancel call', exact: true });
    const retry = card.getByRole('button', { name: 'Try again', exact: true });

    await page.goto(url);
    await card.waitFor();
    if (artifacts) await page.screenshot({path: path.join(artifacts, 'voice-widget-' + engine + '-initial.png')});
    const initial = await card.boundingBox();
    assert.ok(initial.height >= 72 && initial.height <= 180, 'embedded card must stay compact with legacy height: ' + initial.height);
    await start.waitFor({timeout: 2000});
    for (const [width, query] of [[320, ''], [390, '?light'], [1200, '?alias']]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(url + '/' + query);
      await start.waitFor();
      assert.equal(await card.getByRole('button').count(), 1);
      assert.equal(await card.getByRole('status').innerText(), 'Ready to talk');
      assert.equal(await page.locator('.lk-convo, .lk-dock, .lk-drawer, .lk-devices, textarea').count(), 0);
      assert.equal(await page.locator('main > :first-child').getAttribute('data-fullpage'), null);
      assert.equal(await page.evaluate(() => window.captureRequests), 0);
      const box = await card.boundingBox();
      const button = await start.boundingBox();
      assert.ok(box.height >= 72 && box.height <= 180, width + 'px compact height: ' + box.height);
      assert.ok(button.width >= 44 && button.height >= 44, 'call control is a viable touch target');
      assert.ok(box.y + box.height < (await page.locator('.neighbor').boundingBox()).y);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (artifacts) await page.screenshot({path: path.join(artifacts, 'voice-widget-' + engine + '-' + width + '.png')});
    }
    assert.equal(tokenRequests.length, 0, 'opening the widget never connects, even with legacy auto-start settings');

    await page.keyboard.press('Tab');
    assert.equal(await start.evaluate(button => button.getRootNode().activeElement === button), true);
    const [rejectFirstToken] = await Promise.all([nextToken(), page.keyboard.press('Enter')]);
    await cancel.waitFor();
    rejectFirstToken();
    await retry.waitFor().catch(async error => {
      console.error('Status after failed connection:', await card.getByRole('status').innerText());
      throw error;
    });
    assert.equal(await card.getByRole('button').count(), 1);
    assert.ok((await card.boundingBox()).height <= 200, 'a failure stays compact');
    assert.equal(tokenRequests[0].input_mode, 'auto', 'widget uses the authenticated continuous call path');
    assert.equal(page.url(), url + '/?alias');

    const [rejectRetryToken] = await Promise.all([nextToken(), retry.click()]);
    await cancel.click();
    await card.getByText('Ready to talk', { exact: true }).waitFor();
    await start.waitFor();
    assert.equal(await start.isEnabled(), true, 'cancel completes before the stalled token request');
    rejectRetryToken();
    await page.waitForFunction(() => window.tokenResponses === 2);
    await start.waitFor();
    assert.equal(await retry.count(), 0, 'cancelled connection does not surface late error');

    for (const layout of ['fullpage', 'card']) {
      await page.goto(url + '/?layout=' + layout);
      await page.locator('backend-butler-card .lk-call').waitFor();
      await card.getByRole('button', { name: 'Transcript', exact: true }).click();
      await page.locator('backend-butler-card .lk-dock').waitFor();
      assert.equal(await page.locator('backend-butler-card[data-fullpage]').count(), layout === 'fullpage' ? 1 : 0);
      assert.equal(await card.getByRole('button', { name: 'Settings', exact: true }).count(), 1);
    }
    assert.deepEqual(errors, []);
    console.log(engine + ' PASS: registered widget, legacy height, both voice configurations, sizes, authenticated failure, retry, cancel, dedicated workspace');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
