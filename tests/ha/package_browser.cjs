/** Normal compiled HACS card + real disposable HA; only phone hardware is emulated. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const requireCard = require('node:module').createRequire(path.resolve(__dirname, '../../apps/dashboard-card/package.json'));
const { chromium } = requireCard('playwright');

(async () => {
 const state = process.env.BUTLER_PACKAGE_STATE;
 assert.ok(state?.startsWith('/tmp/butler-standard-package-'));
 const child = spawn(process.env.BUTLER_PACKAGE_PYTHON, [path.join(__dirname, 'peer.py')], {
  env: { ...process.env, BUTLER_NATIVE_LAB_STATE: state, BUTLER_NATIVE_LAB_PORT: '18125', BUTLER_NATIVE_AUTH_FILE: 'alice-auth.json' }, stdio: ['pipe','pipe','inherit'],
 });
 let sequence=0, page, closing=false, delivery=Promise.resolve();
 const pending=new Map(), events=[], errors=[];
 readline.createInterface({input:child.stdout}).on('line', line=>{
  const result=JSON.parse(line);
  if(result.event){events.push(result.event);delivery=delivery.then(()=>{if(!closing)return page?.evaluate(event=>window.nativeEvent?.(event),result.event)});delivery.catch(()=>{});return;}
  const item=pending.get(result.id);pending.delete(result.id);
  if(item)result.error?item.reject(Error(result.error)):item.resolve(result.result);
 });
 child.on('exit',code=>{for(const item of pending.values())item.reject(Error('Peer exited '+code));pending.clear()});
 const call=method=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method})+'\n')});
 const wait=async predicate=>{const end=Date.now()+15000;while(!(await predicate())){if(Date.now()>end)throw Error('Timed out waiting for native UI');await new Promise(r=>setTimeout(r,50))}};
 const bundle=fs.readFileSync(path.join(state,'custom_components/backend_butler/frontend/backend-butler-card.js'));
 const server=http.createServer((request,response)=>{
  response.setHeader('Content-Type',request.url==='/card.js'?'text/javascript':'text/html');
  response.end(request.url==='/card.js'?bundle:'<meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#181818;color:#eee"><script type="module" src="/card.js"></script>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP butler-package.test 127.0.0.1']});
 try{
  page=await browser.newPage({viewport:{width:402,height:874}});
  page.on('pageerror',error=>{errors.push(String(error));console.error('PAGE ERROR',error.stack)});
  page.on('console',message=>{if(message.type()==='error')console.error('CONSOLE',message.text())});
  await page.exposeFunction('bridgeCall',call);
  await page.goto('http://butler-package.test:'+server.address().port);
  await page.waitForFunction(()=>customElements.get('backend-butler-card'));
  assert.equal(await page.evaluate(()=>isSecureContext),false);
  assert.equal(await page.evaluate(()=>typeof navigator.mediaDevices),'undefined');
  await page.evaluate(()=>{
   window.nativeCalls=[];window.playedFrames=0;window.apiCalls=[];window.controlCalls=[];
   const original=AudioBufferSourceNode.prototype.start;
   AudioBufferSourceNode.prototype.start=function(...args){window.playedFrames++;return original.apply(this,args)};
   const external={config:{webrtc:{hasCameraMicrophoneStream:true}},sendMessage:message=>{
    window.nativeCalls.push(message);assertNative(message);return window.bridgeCall('start');
   },fireMessage:message=>{window.nativeCalls.push(message);void window.bridgeCall('stop')}};
   function assertNative(message){if(message.type!=='webrtc/stream/start'||!/^camera.backend_butler_native_audio_/.test(message.payload.entity_id))throw Error('Unexpected native command')}
   const card=document.createElement('backend-butler-card');card.setConfig({type:'custom:backend-butler-card',audio_output:true,layout:'fullpage',input_mode:'push_to_talk'});
   card.hass={states:{},user:{id:'synthetic-alice',is_admin:false},auth:{external},connection:{subscribeMessage:async(callback,message)=>{
    window.nativeEvent=callback;await window.bridgeCall(message);return()=>{window.nativeEvent=undefined;return window.bridgeCall('unsubscribe_native_events')};
   }},callWS:async message=>{
    window.controlCalls.push(message);
    if (window.holdNextAudioSetting && message.command === 'set_audio_output' && message.payload === 'off') {
     window.holdNextAudioSetting = false;
     return new Promise((_, reject) => {
      window.rejectLateAudioSetting = () => reject(Error('Session closed before the audio setting returned'));
     });
    }
    const result = await window.bridgeCall(message);
    if (message.command === 'disconnect') window.disconnectAcknowledged = true;
    return result;
   },callService:async()=>{throw Error('No household services')},callApi:(verb,path,data)=>{
    window.apiCalls.push({verb,path});return window.bridgeCall({api:true,verb,path,data});
   }};
   document.body.append(card);
  });
  await page.getByRole('button',{name:'Start talking',exact:true}).click();
  await page.getByRole('button',{name:'Send recording',exact:true}).waitFor();
  // The button appears optimistically while HA is still opening the native session.
  // Establish the baseline only after the real bridge start has arrived.
  await wait(()=>page.evaluate(()=>window.nativeCalls.some(message=>message.type==='webrtc/stream/start')));
  const captureCount=await page.evaluate(()=>window.nativeCalls.length);
  await page.getByRole('button',{name:'Transcript',exact:true}).click();
  await page.locator('textarea').fill('Keep my native draft');
  await page.getByRole('button',{name:'Live view',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.nativeCalls.length),captureCount,'view changes preserve the native microphone');
  await page.getByRole('button',{name:'Transcript',exact:true}).click();
  assert.equal(await page.locator('textarea').inputValue(),'Keep my native draft');
  await page.getByRole('button',{name:'Live view',exact:true}).click();
  // Give the paced synthetic peer time to send real PCM through the HA camera.
  await page.waitForTimeout(350);
  await page.getByRole('button',{name:'Send recording',exact:true}).click();
  await page.locator('.lk-live-stage').getByText('Synthetic spoken question',{exact:true}).waitFor();
  await page.locator('.lk-live-stage').getByText('Synthetic reply for person-alice',{exact:true}).waitFor();
  await wait(()=>page.evaluate(()=>window.playedFrames>0));
  await wait(()=>page.evaluate(()=>window.controlCalls.some(call=>call.command==='playback_finished'&&call.payload==='1')));
  const before=events.filter(e=>e.type==='conversation').at(-1).items.length;
  await page.getByRole('button',{name:'Start talking',exact:true}).click();
  await page.getByRole('button',{name:'Send recording',exact:true}).waitFor();
  await page.getByRole('button',{name:'Cancel recording',exact:true}).click();
  await page.waitForTimeout(150);
  assert.equal(events.filter(e=>e.type==='conversation').at(-1).items.length,before);
  const captures='/tmp/butler-live-native-captures';fs.mkdirSync(captures,{recursive:true});
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(250);
  await page.screenshot({path:path.join(captures,'phone-native-reply.png')});
  await page.getByRole('button', { name: 'Transcript', exact: true }).click();
  const composer = page.getByRole('textbox', { name: 'Message Backend Butler', exact: true });
  const followup = 'Explain the previous answer';
  const followupBubble = page.locator('.lk-call-transcript .lk-msg[data-role="user"]')
   .getByText(followup, { exact: true });
  await composer.fill(followup);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await wait(() => events.filter(event => event.type === 'conversation').at(-1)?.items
   .some(item => item.role === 'user' && item.text === followup));
  await wait(() => composer.inputValue().then(value => value === ''));
  await delivery;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const textCommands = await page.evaluate(text => window.controlCalls
   .filter(call => call.command === 'text' && call.payload === text).length, followup);
  assert.equal(textCommands, 1, 'one native text command');
  assert.equal(await followupBubble.count(), 1, 'one live transcript entry for the typed follow-up');

  // Delay one card-side response across a real Home Assistant disconnect.
  await page.evaluate(() => { window.holdNextAudioSetting = true; });
  await page.getByRole('button', { name: 'Silence spoken replies', exact: true }).click();
  await page.waitForFunction(() => typeof window.rejectLateAudioSetting === 'function');
  await page.getByRole('button',{name:'End voice session',exact:true}).click();
  await page.waitForFunction(() => window.disconnectAcknowledged);
  await page.evaluate(async () => {
   window.rejectLateAudioSetting();
   await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.getByRole('button', { name: 'Start talking', exact: true }).waitFor();
  assert.equal(await composer.inputValue(), '', 'End leaves the empty draft empty');
  assert.deepEqual(await page.getByRole('alert').allTextContents(), [], 'a late setting failure cannot recreate recovery after End');
  assert.equal(await page.getByText(/your typed draft/i).count(), 0, 'End does not claim the empty draft exists');
  console.log('PASS: packaged card ignores a delayed audio-setting failure after confirmed End with an empty draft');
  await page.getByRole('button',{name:'Conversation history',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'Conversations',exact:true});
  await drawer.waitFor();
  await wait(()=>drawer.locator('.lk-taskrow .lk-taskrow-main').count().then(n=>n>0));
  await drawer.getByRole('button',{name:'New conversation',exact:true}).click();
  await drawer.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Conversation history',exact:true}).click();
  await wait(()=>drawer.locator('.lk-taskrow .lk-taskrow-main').count().then(n=>n>1));
  await drawer.locator('.lk-taskrow .lk-taskrow-main').first().click();
  await drawer.getByRole('button',{name:'Continue this conversation',exact:true}).click();
  await drawer.waitFor({state:'hidden'});
  if (await page.getByRole('button', { name: 'Transcript', exact: true }).isVisible()) {
   await page.getByRole('button', { name: 'Transcript', exact: true }).click();
  }
  await page.locator('.lk-call-transcript').getByText('Synthetic spoken question',{exact:true}).waitFor();
  await followupBubble.waitFor();
  assert.equal(await followupBubble.count(), 1, 'one saved transcript entry for the typed follow-up');
  console.log('PASS: one typed follow-up after speaking sends one native command and renders once live and in saved history');
  assert.equal(await page.evaluate(()=>window.apiCalls.some(c=>c.path.includes('/warm'))),false,'native history switches never warm a competing text session');
  assert.equal(await page.evaluate(()=>window.nativeCalls.some(m=>m.type==='assist/show')),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:state+'/standard-native-http.png'});
  await page.getByRole('button',{name:'End voice session',exact:true}).click();
  assert.deepEqual(errors,[]);
  console.log('PASS: production compiled card on insecure HTTP, native capture/Send/Cancel, PCM reply playback, ordinary-user history preview/resume, no browser mic/Assist/text warmup');
 }catch(error){console.error('Card text:',await page?.locator('backend-butler-card').innerText());console.error('Alerts:',await page?.getByRole('alert').allTextContents());console.error('Page errors:',errors);throw error;}
 finally{closing=true;await delivery.catch(()=>{});await browser.close();await new Promise(r=>server.close(r));child.stdin.end();}
})().catch(error=>{console.error(error);process.exit(1)});
