/** End/idle/native teardown against real provider/UI; no household or microphone. */
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const esbuild = require('esbuild');
(async () => {
  const built = await esbuild.build({ entryPoints: [path.join(__dirname, 'fixtures/native-lifecycle.tsx')], bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'silent' });
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', req.url === '/fixture.js' ? 'text/javascript' : 'text/html'); res.end(req.url === '/fixture.js' ? built.outputFiles[0].contents : '<meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#181818;color:#eee"><script src="/fixture.js"></script>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const engine = process.env.ENGINE === 'webkit' ? webkit : chromium;
  const browser = await engine.launch({ headless: true }); const errors = []; let page;
  const mount = async (query = '') => {
    await page?.close(); page = await browser.newPage({ viewport: { width: 402, height: 874 } }); page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/' + query);
    await page.getByRole('button', { name: 'Start call', exact: true }).waitFor();
  };
  const open = async (draft = '') => {
    await mount();
    await page.getByRole('button', { name: 'Start call', exact: true }).click();
    await page.getByRole('button', { name: 'Pause listening', exact: true }).waitFor();
    await page.waitForFunction(() => window.requests.some(request => request.command === 'start_turn'));
    assert.equal(await page.evaluate(() => window.audioResumesInTap[0]), true, 'native reply audio unlock begins synchronously in the start tap');
    await page.getByRole('button', { name: 'Transcript', exact: true }).click();
    if (draft) await page.locator('textarea').fill(draft);
  };
  const end = async () => { await page.evaluate(() => { window.endStarted = true; }); await page.getByRole('button', { name: 'End voice session', exact: true }).click(); await page.waitForFunction(() => window.requests.some(request => request.command === 'disconnect')); };
  const assertEnded = async (draft = '') => {
    await page.getByRole('button', { name: 'Start call', exact: true }).waitFor();
    assert.equal(await page.locator('textarea').inputValue(), draft);
    assert.deepEqual(await page.getByRole('alert').allTextContents(), [], 'intentional End has no retry/error surface');
    assert.equal(await page.getByText(/typed draft is still here|draft is saved below/).count(), 0, 'End never invents a saved draft');
    assert.equal(await page.evaluate(() => window.stops), 1, 'capture is released once');
    assert.equal(await page.evaluate(() => window.opens), 1, 'cleanup never reopens a session');
    assert.equal(await page.evaluate(() => window.requests.filter(request => request.command === 'disconnect').length), 1, 'cleanup closes once');
    await page.locator('.lk-call-transcript .lk-bubble').getByText('A completed synthetic reply.', { exact: true }).waitFor();
  };
  try {
    await open();
    const followUp = 'A synthetic typed follow-up.';
    const transcript = page.locator('.lk-call-transcript');
    const userBubbles = transcript.locator('.lk-msg[data-role="user"]').getByText(followUp, { exact: true });
    const composer = page.getByRole('textbox', { name: 'Message Backend Butler' });
    const sendFollowUp = async turn => {
      await composer.fill(followUp);
      await composer.press('Enter');
      await page.waitForFunction(() => document.querySelector('body > div').shadowRoot.querySelector('textarea').value === '');
      assert.deepEqual(await page.evaluate(() => window.requests.filter(request => request.command === 'text').map(request => request.payload)), Array(turn).fill(followUp));
      await page.evaluate(() => window.publishConversation());
      await transcript.getByText(`Synthetic reply to typed follow-up ${turn}.`, { exact: true }).waitFor();
      assert.equal(await userBubbles.count(), turn, 'each accepted send should produce one authoritative bubble');
    };
    await sendFollowUp(1);
    await page.evaluate(() => {
      window.publishConversation();
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    assert.equal(await userBubbles.count(), 1, 'replaying the same snapshot should retain one bubble');
    await sendFollowUp(2);
    console.log('PASS: native typed follow-ups use durable message IDs and preserve separate identical sends');

    await open(); await page.evaluate(() => { window.holdDisconnect = true; }); await end();
    await page.getByRole('button', { name: 'Start call', exact: true }).click();
    assert.equal(await page.evaluate(() => window.requests.filter(request => request.type.endsWith('/prepare')).length), 1, 'Call during End never prepares a new receiver');
    await page.evaluate(() => window.releaseDisconnect()); await page.waitForTimeout(250); await assertEnded();
    console.log('PASS: automatic End cancels settings sync without false connection/draft errors');
    for (const pending of ['Prepare', 'Connect']) {
      await mount();
      await page.evaluate(pending => { window['hold' + pending] = true; }, pending);
      await page.getByRole('button', { name: 'Start call', exact: true }).click();
      await page.waitForFunction(pending => typeof window['release' + pending] === 'function', pending);
      await page.getByRole('button', { name: 'End voice session', exact: true }).click();
      await page.evaluate(pending => window['release' + pending](), pending);
      await page.waitForFunction(() => window.disconnectCompleted);
      await page.getByRole('button', { name: 'Start call', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Start call', exact: true }).isEnabled(), true, 'cancelled native startup returns to an available Call control');
      assert.equal(await page.getByRole('button', { name: 'Starting call', exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => window.opens), 1, 'cancelled native startup cannot reopen');
      assert.equal(await page.evaluate(() => window.requests.filter(request => request.command === 'disconnect').length), 1);
      assert.deepEqual(await page.getByRole('alert').allTextContents(), []);
    }
    console.log('PASS: End during native prepare/connect clears Starting without late capture/errors');

    for (const command of ['set_audio_output', 'playback_finished']) {
      await open('Keep this unsent text'); await page.evaluate(command => { window.hold = command; }, command);
      if (command === 'set_audio_output') await page.getByRole('button', { name: 'Enable spoken replies', exact: true }).click();
      else await page.evaluate(() => window.nativeEvent({ type: 'audio_end', segment: 1 }));
      await page.waitForFunction(() => window.pending.length > 0); await end(); await page.evaluate(() => window.releasePending()); await page.waitForTimeout(100); await assertEnded('Keep this unsent text');
    }
    console.log('PASS: late settings/playback acknowledgements stay obsolete after End; drafts/history survive');
    await open();
    await page.evaluate(() => { window.hold = 'playback_finished'; window.nativeEvent({ type: 'audio_end', segment: 2 }); });
    await page.waitForFunction(() => window.pending.length > 0);
    await end(); await page.waitForFunction(() => window.disconnectCompleted);
    await page.evaluate(() => { window.hold = ''; });
    await page.getByRole('button', { name: 'Start call', exact: true }).click();
    await page.waitForFunction(() => window.opens === 2);
    await page.getByRole('button', { name: 'Pause listening', exact: true }).waitFor();
    await page.evaluate(() => window.releasePending());
    await page.waitForTimeout(50);
    assert.deepEqual(await page.getByRole('alert').allTextContents(), [], 'old request rejection cannot fail the new native session');
    assert.equal(await page.evaluate(() => window.requests.filter(request => request.command === 'disconnect').length), 1);
    console.log('PASS: late rejection from an earlier session cannot affect a new call');
    await open();
    await page.getByRole('button', { name: 'Enable spoken replies', exact: true }).click();
    await page.getByRole('button', { name: 'Silence spoken replies', exact: true }).waitFor();
    await page.evaluate(async () => {
      await window.audioContext.suspend();
      window.nativeEvent({ type: 'audio', pcm: btoa('\0\0'.repeat(480)), sample_rate: 48000, channels: 1 });
      window.holdAudio = true;
    });
    await page.getByRole('button', { name: 'Enable reply audio', exact: true }).click();
    await page.waitForFunction(() => typeof window.rejectAudio === 'function');
    await end(); await page.waitForFunction(() => window.disconnectCompleted);
    await page.evaluate(() => window.rejectAudio(Error('Synthetic obsolete audio unlock failure')));
    await page.waitForTimeout(50); await assertEnded();
    assert.equal(await page.getByText(/Audio could not start/).count(), 0);
    console.log('PASS: obsolete reply-audio unlock rejection stays quiet after End');


    for (const draft of ['', '   ', 'A real unsent draft']) {
      await open(draft); await page.evaluate(() => window.nativeEvent({ type: 'error', message: 'Synthetic active speech failure' }));
      await page.getByRole('alert').filter({ hasText: 'Synthetic active speech failure' }).waitFor();
      assert.equal(await page.getByRole('alert').count(), 1, 'one recovery notice owns an active failure');
      assert.equal(await page.locator('textarea').inputValue(), draft);
      assert.equal(await page.getByText(/Your typed draft is still here/).count() > 0, Boolean(draft.trim()), 'draft copy reflects actual input');
    }
    await open('Retain this after close failure'); await page.evaluate(() => { window.disconnectFails = true; }); await end();
    await page.getByRole('alert').filter({ hasText: /couldn.t confirm.*saved|couldn.t confirm.*closed|couldn.t finish ending/i }).waitFor();
    assert.equal(await page.locator('textarea').inputValue(), 'Retain this after close failure');
    assert.equal(await page.getByText('Voice session couldn’t connect', { exact: true }).count(), 0, 'close failure is not connect failure');
    console.log('PASS: active failures stay visible; real close/save failure is reported truthfully');
    await open(); await page.evaluate(() => { window.endStarted = true; }); await page.getByRole('button', { name: 'End voice session', exact: true }).click();
    await page.evaluate(() => { window.nativeEvent?.({ type: 'idle' }); window.unmount(); }); await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.stops), 1); assert.equal(await page.evaluate(() => window.requests.filter(request => request.command === 'disconnect').length), 1); assert.equal(await page.evaluate(() => window.opens), 1);
    assert.deepEqual(errors, []); console.log('PASS: overlapping End/idle/unmount share cleanup without unhandled errors');

    const widgetButton = name => page.locator('.lk-voice-widget').getByRole('button', { name, exact: true });
    const pendingRequest = name => page.waitForFunction(name => typeof window[name] === 'function', name);
    for (const audio of ['on', 'off']) {
      await mount('?layout=voice&audio=' + audio);
      const widget = page.locator('.lk-voice-widget');
      assert.equal(await widget.getByRole('button').count(), 1);
      assert.equal(await page.evaluate(() => window.opens), 0, 'native widget stays idle despite legacy auto-start settings');
      await widgetButton('Start call').click();
      await widget.getByText('Listening', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.audioResumesInTap[0]), true, 'native audio unlock starts in the user gesture');
      const requests = await page.evaluate(() => window.requests);
      assert.equal(requests.find(request => request.type.endsWith('/prepare')).continuous, true);
      assert.equal(requests.find(request => request.command === 'set_turn_mode').payload, 'auto');
      assert.equal(requests.find(request => request.command === 'set_audio_output').payload, audio);
      await widgetButton('End call').click();
      await page.waitForFunction(() => window.disconnectCompleted);
      await widget.getByText('Ready to talk', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.stops), 1);
      assert.equal(await page.evaluate(() => window.requests.filter(request => request.command === 'disconnect').length), 1);
    }
    console.log('PASS: native widget arms a continuous receiver, respects reply audio and releases capture on End');

    await mount('?layout=voice');
    await page.evaluate(() => { window.holdPrepare = true; });
    await widgetButton('Start call').click();
    await pendingRequest('releasePrepare');
    await widgetButton('Cancel call').click();
    await page.evaluate(() => window.releasePrepare());
    await page.waitForFunction(() => window.disconnectCompleted);
    assert.equal(await page.evaluate(() => window.captures), 0, 'cancelled native prepare cannot acquire the microphone');
    assert.equal(await widgetButton('Try again').count(), 0, 'intentional cancellation stays quiet');

    await mount('?layout=voice');
    await widgetButton('Start call').click();
    await widgetButton('End call').waitFor();
    await page.evaluate(() => { window.holdDisconnect = true; window.nativeEvent({ type: 'error', message: 'Synthetic conversation save error' }); });
    await pendingRequest('releaseDisconnect');
    assert.equal(await widgetButton('Try again').isEnabled(), false, 'retry waits for native durable close');
    await page.evaluate(() => { window.holdDisconnect = false; window.releaseDisconnect(); });
    await widgetButton('Try again').click();
    await widgetButton('End call').waitFor();
    assert.equal(await page.evaluate(() => window.opens), 2, 'native widget retry opens a fresh authenticated session');
    await widgetButton('End call').click();
    assert.deepEqual(errors, []);
    console.log('PASS: native widget cancels delayed prepare and serializes recovery after a conversation error');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exit(1); });
