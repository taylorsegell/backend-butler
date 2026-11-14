const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {spawn} = require('node:child_process');
const readline = require('node:readline');
const {createRequire} = require('node:module');
const requireCard = createRequire(path.resolve(__dirname, '../../apps/dashboard-card/package.json'));
const {chromium} = requireCard('playwright');
(async () => {
 const child = spawn('/tmp/butler-native-audio-venv/bin/python', [path.join(__dirname,'bridge_peer.py')], {stdio:['pipe','pipe','inherit']});
 let sequence=0;const pending=new Map();const requests=[];
 readline.createInterface({input:child.stdout}).on('line',line=>{const message=JSON.parse(line);const promise=pending.get(message.id);pending.delete(message.id);if(promise){message.error?promise.reject(Error(message.error)):promise.resolve(message.result)}});
 child.on('exit',code=>{for(const item of pending.values())item.reject(Error('Native peer exited: '+code));pending.clear()});
 const call=method=>new Promise((resolve,reject)=>{const id=++sequence;requests.push(method);pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method})+'\n')});
 const waitStats=async predicate=>{const deadline=Date.now()+10000;for(;;){const stats=await call('butler_native_audio_poc/status');if(predicate(stats))return stats;if(Date.now()>deadline)throw Error('Audio metrics did not reach the required state: '+JSON.stringify(stats));await new Promise(resolve=>setTimeout(resolve,40))}};
 const bundle=fs.readFileSync('/tmp/butler-native-audio-lab/custom_components/butler_native_audio_poc/frontend/card.js');
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/card.js'?'text/javascript':'text/html');res.end(req.url==='/card.js'?bundle:'<meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#181818"><script src="/card.js"></script>')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP butler-audio.test 127.0.0.1']});
 try {
  const page=await browser.newPage({viewport:{width:402,height:874}});const errors=[];page.on('pageerror',error=>{errors.push(String(error));console.error('Page error:',String(error))});
  await page.exposeFunction('pocCall',call);
  await page.goto('http://butler-audio.test:'+port);
  await page.waitForFunction(()=>customElements.get('backend-butler-native-poc'),{},{timeout:5000}).catch(async error=>{console.error('Fixture document:',(await page.content()).slice(0,500));throw error});
  assert.equal(await page.evaluate(()=>isSecureContext),false);
  assert.equal(await page.evaluate(()=>typeof navigator.mediaDevices),'undefined');
  await page.evaluate(()=>{
   window.nativeCalls=[];
   const external={config:{webrtc:{hasCameraMicrophoneStream:true}},sendMessage:message=>{window.nativeCalls.push(message);return window.pocCall('start')},fireMessage:message=>{window.nativeCalls.push(message);void window.pocCall('stop')}};
   const card=document.createElement('backend-butler-native-poc');card.setConfig({});card.hass={states:{},user:{id:'synthetic-test',is_admin:true},auth:{external},callWS:message=>window.pocCall(message.type)};document.body.append(card);
  });
  await page.getByRole('button',{name:'Start talking',exact:true}).click();
  await page.waitForFunction(()=>window.nativeCalls.some(message=>message.type==='webrtc/stream/start'));
  await waitStats(stats=>stats.sdk_frames>=4);
  await page.getByRole('button',{name:'Send recording',exact:true}).click();
  await page.getByText(/Audio received:.*LiveKit PCM frames/).last().waitFor({timeout:8000}).catch(async error=>{console.error('Card:',await page.locator('.lk-root').innerText());console.error('Bridge:',await page.evaluate(()=>window.nativeCalls));console.error('Requests:',requests.filter(method=>!method.endsWith('/status')));await page.screenshot({path:'/tmp/butler-native-audio-fail.png'});throw error});
  assert.equal(await page.evaluate(()=>window.nativeCalls.some(message=>message.type==='assist/show')),false);
  assert.equal(new URL(page.url()).hostname,'butler-audio.test');
  assert.equal(await page.locator('backend-butler-native-poc').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:'Start talking',exact:true}).click();
  await waitStats(stats=>stats.sdk_frames>=4);
  await page.getByRole('button',{name:'Cancel recording',exact:true}).click();
  await waitStats(stats=>!stats.active);
  await page.getByRole('button',{name:'Start talking',exact:true}).click();
  await waitStats(stats=>stats.sdk_frames>=4);
  await page.evaluate(()=>document.querySelector('backend-butler-native-poc').remove());
  await waitStats(stats=>!stats.active);
  await page.evaluate(()=>{
   const card=document.createElement('backend-butler-native-poc');card.setConfig({});
   card.hass={states:{},user:{id:'synthetic-test',is_admin:true},callWS:message=>window.pocCall(message.type)};
   document.body.append(card);
  });
  const starts=await page.evaluate(()=>window.nativeCalls.filter(message=>message.type==='webrtc/stream/start').length);
  await page.getByRole('button',{name:'Start talking',exact:true}).click();
  await page.getByText('Native microphone is unavailable',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.nativeCalls.filter(message=>message.type==='webrtc/stream/start').length),starts);
  assert.equal(await page.getByText(/Open Home Assistant over HTTPS/).count(),0);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'/tmp/butler-native-audio-http.png'});
  console.log('PASS: existing Butler UI on insecure HTTP, native bridge protocol, real HA WebRTC/PCM, send/cancel/unmount, unsupported-app message, no browser microphone/Assist, mobile layout');
 } finally {
  await browser.close();await new Promise(resolve=>server.close(resolve));child.stdin.end();
 }
})().catch(error=>{console.error(error);process.exit(1)});
