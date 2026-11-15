/** Real speech services + HA WebRTC; only the native hardware peer is emulated. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const { createRequire } = require('node:module');
const requireCard = createRequire(path.resolve(__dirname, '../../apps/dashboard-card/package.json'));
const { chromium } = requireCard('playwright');

(async () => {
  const state = process.env.BUTLER_NATIVE_LAB_STATE || '/tmp/butler-native-audio-lab';
  const child = spawn('/tmp/butler-native-audio-venv/bin/python', [path.join(__dirname, 'bridge_peer.py')], {
    env: { ...process.env, BUTLER_NATIVE_TEST_WAV: state + '/synthetic-speech.wav' }, stdio: ['pipe', 'pipe', 'inherit'],
  });
  let closing = false;
  let sequence = 0, page, delivery = Promise.resolve();
  const pending = new Map();
  const events = [];
  readline.createInterface({ input: child.stdout }).on('line', line => {
    const message = JSON.parse(line);
    if (message.event) {
      events.push(message.event);
      delivery = delivery.then(() => { if (!closing) return page?.evaluate(event => window.pocEvent?.(event), message.event); });
      delivery.catch(() => {});
      return;
    }
    const item = pending.get(message.id); pending.delete(message.id);
    if (item) message.error ? item.reject(Error(message.error)) : item.resolve(message.result);
  });
  child.on('exit', code => { for (const item of pending.values()) item.reject(Error('Native peer exited: ' + code)); pending.clear(); });
  const call = method => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, method }) + '\n');
  });
  const wait = async predicate => {
    const deadline = Date.now() + 30000;
    while (!(await predicate())) { if (Date.now() > deadline) throw Error('Timed out waiting for speech result'); await new Promise(r => setTimeout(r, 80)); }
  };
  const bundle = fs.readFileSync(state + '/custom_components/butler_native_audio_poc/frontend/card.js');
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/card.js' ? 'text/javascript' : 'text/html');
    response.end(request.url === '/card.js' ? bundle : '<meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><script src="/card.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP butler-audio.test 127.0.0.1'] });
  try {
    page = await browser.newPage({ viewport: { width: 402, height: 874 } });
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    await page.exposeFunction('pocCall', call);
    await page.goto('http://butler-audio.test:' + server.address().port);
    await page.waitForFunction(() => customElements.get('backend-butler-native-poc'));
    assert.equal(await page.evaluate(() => isSecureContext), false);
    assert.equal(await page.evaluate(() => typeof navigator.mediaDevices), 'undefined');
    await page.evaluate(() => {
      window.nativeCalls = []; window.playedFrames = 0;
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) { window.playedFrames++; return start.apply(this, args); };
      const external = { config: { webrtc: { hasCameraMicrophoneStream: true } },
        sendMessage: message => { window.nativeCalls.push(message); return window.pocCall('start'); },
        fireMessage: message => { window.nativeCalls.push(message); void window.pocCall('stop'); } };
      const connection = { subscribeMessage: async (callback, command) => {
        window.pocEvent = callback; await window.pocCall(command);
        return () => { window.pocEvent = undefined; };
      } };
      const card = document.createElement('backend-butler-native-poc'); card.setConfig({});
      card.hass = { states: {}, user: { id: 'synthetic-test', is_admin: true }, auth: { external }, connection, callWS: message => window.pocCall(message) };
      document.body.append(card);
    });
    await page.getByRole('button', { name: 'Start talking', exact: true }).click();
    await wait(async () => (await call('butler_native_audio_poc/status')).samples >= 192000);
    await page.getByRole('button', { name: 'Send recording', exact: true }).click();
    await wait(() => events.some(e => e.type === 'conversation' && e.items.some(item => item.role === 'agent' && /four|4/i.test(item.text))));
    await wait(() => events.some(e => e.type === 'audio_end'));
    await delivery;
    await page.getByText(/four|4/i).last().waitFor();
    assert.ok(await page.evaluate(() => window.playedFrames) > 0, 'real TTS PCM was scheduled for playback');
    const final = events.filter(e => e.type === 'conversation').at(-1).items;
    assert.ok(final.some(item => item.role === 'user' && item.text.trim()), 'real STT transcript is present');
    assert.equal(await page.evaluate(() => window.nativeCalls.some(message => message.type === 'assist/show')), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: '/tmp/butler-native-speech-http.png' });
    const before = final.length;
    await page.getByRole('button', { name: 'Start talking', exact: true }).click();
    await wait(async () => (await call('butler_native_audio_poc/status')).sdk_frames >= 75);
    await page.getByRole('button', { name: 'Cancel recording', exact: true }).click();
    await wait(async () => !(await call('butler_native_audio_poc/status')).active);
    await new Promise(resolve => setTimeout(resolve, 1000));
    assert.equal(events.filter(e => e.type === 'conversation').at(-1).items.length, before, 'Cancel discards recognition without generating a reply');
    if (process.env.BUTLER_NATIVE_HISTORY === '1') {
      const listing = (await call({type:'butler_native_audio_poc/history',operation:'conversations',data:{}})).body;
      assert.ok(listing.conversations.length);
      await page.getByRole('button',{name:'Conversation history',exact:true}).click();
      const drawer = page.getByRole('dialog',{name:'Conversations',exact:true});
      await drawer.getByRole('button',{name:'New conversation',exact:true}).click();
      await drawer.waitFor({state:'hidden',timeout:20000});
      const next = (await call({type:'butler_native_audio_poc/history',operation:'conversations',data:{}})).body;
      assert.notEqual(next.current,listing.current,'New conversation creates a real separate stored context');
      await page.getByRole('button',{name:'Conversation history',exact:true}).click();
      await wait(async () => JSON.stringify(await drawer.locator('.lk-taskrow-desc').allTextContents()) === JSON.stringify(next.conversations.map(row => row.title || 'New conversation')));
      const target = next.conversations.findIndex(row => row.id === listing.current);
      assert.ok(target >= 0);
      await drawer.locator('.lk-taskrow .lk-taskrow-main').nth(target).click();
      await drawer.getByRole('button',{name:'Continue this conversation',exact:true}).waitFor();
      assert.doesNotMatch(await drawer.innerText(),/cobalt valley/i);
      const spokenText=final.filter(item=>item.kind==='message' && item.role==='user').at(-1).text;
      await drawer.getByText(spokenText,{exact:true}).last().waitFor();
      await page.screenshot({path:'/tmp/butler-native-worker-history.png'});
      await drawer.getByRole('button',{name:'Continue this conversation',exact:true}).click();
      await drawer.waitFor({state:'hidden',timeout:20000});
      assert.equal((await call({type:'butler_native_audio_poc/history',operation:'conversations',data:{}})).body.current,listing.current);
      console.log('PASS: existing history drawer lists, previews, resumes and starts a new real worker conversation');
    }
    await page.locator('backend-butler-native-poc').evaluate(element => element.remove());
    assert.deepEqual(errors, []);
    console.log('PASS: insecure HTTP + existing Butler UI + real HA WebRTC/STT/model/TTS, reply playback scheduled, Cancel, no browser mic or Assist');
    console.log('Synthetic transcript and reply:', JSON.stringify(final.map(item => ({ role: item.role, text: item.text }))));
  } catch (error) {
    console.error('UI alerts:', await page?.getByRole('alert').allTextContents());
    throw error;
  } finally {
    closing = true;
    await delivery.catch(() => {}); await browser.close(); await new Promise(resolve => server.close(resolve)); child.stdin.end();
  }
})().catch(error => { console.error(error); process.exit(1); });
