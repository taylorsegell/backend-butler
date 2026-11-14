const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const esbuild=require('node:module').createRequire(require.resolve('vite/package.json'))('esbuild');
(async()=>{
 const built=await esbuild.build({entryPoints:[path.join(__dirname,'fixtures/microphone-card.tsx')],bundle:true,write:false,format:'iife',jsx:'automatic',logLevel:'silent',plugins:[...(process.env.BASELINE_APP?[{name:'baseline-app',setup(build){build.onLoad({filter:/\/src\/App\.tsx$/},args=>({contents:fs.readFileSync(process.env.BASELINE_APP,'utf8'),loader:'tsx',resolveDir:path.dirname(args.path)}))}}]:[]),{name:'isolated-session',setup(build){build.onResolve({filter:/^@livekit\/components-react$/},()=>({path:path.join(__dirname,'fixtures/microphone-session.tsx')}))}}]});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?built.outputFiles[0].contents:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#181818;color:#eee}</style><body><script src="/fixture.js"></script>')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const engine=process.env.ENGINE||'chromium';let browser;
 try{
  browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,args:engine==='chromium'?['--no-sandbox']:[]});
  const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>{errors.push(String(e));console.error('Fixture page error:',String(e))});
  for(const layout of ['fullpage','voice'])for(const width of [320,402,560]){
   await page.setViewportSize({width,height:874});await page.goto(base+'/?layout='+layout);await page.getByRole('button',{name:'Start talking',exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>window.captureRequests),0,'idle never captures');
   await page.getByRole('button',{name:'Start talking',exact:true}).click();
   const recovery=page.locator('.lk-recovery');await recovery.getByText('Microphone couldn’t start',{exact:true}).waitFor().catch(async e=>{console.error('Card:',await page.locator('.lk-root').innerText());console.error('Capture timing:',await page.evaluate(()=>({requests:window.captureInTap,installed:window.captureInstalled,method:navigator.mediaDevices.getUserMedia.toString()})));console.error('Capture error:',await page.locator('.lk-recovery details').textContent());await page.screenshot({path:'/tmp/butler-mic-fixture-fail.png'});throw e});
   await page.waitForFunction(()=>window.connectionStarted===true);await page.waitForTimeout(200);
   assert.deepEqual(await page.evaluate(()=>window.captureInTap),[true],'capture starts in the trusted tap before connection awaits');
   assert.equal(await recovery.count(),1);assert.equal(await page.locator('.lk-voice-feedback').count(),0,'one recovery surface, no duplicate feedback panel');
   assert.equal(await recovery.getByText('Connection settings',{exact:true}).count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await recovery.getByText('Diagnostic details',{exact:true}).click();await recovery.getByText('Microphone capture: NotReadableError: Synthetic capture failure',{exact:true}).waitFor();
   const input=page.locator('textarea');await input.fill('Text still works');await input.press('Enter');await page.waitForFunction(()=>window.typedMessages.includes('Text still works'));
   await page.evaluate(()=>{window.failure=null});
   await page.getByRole('button',{name:'Start talking',exact:true}).click();await page.getByRole('button',{name:'Send recording',exact:true}).waitFor();await page.waitForFunction(()=>window.streams.length>0);
   await page.getByRole('button',{name:'Cancel recording',exact:true}).click();
   await page.waitForFunction(()=>window.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
   if(width===402&&layout==='fullpage'){
    await page.evaluate(()=>{window.failure='NotReadableError'});await page.getByRole('button',{name:'Start talking',exact:true}).click();await page.locator('.lk-recovery').waitFor();
    await page.screenshot({path:path.join(process.env.ARTIFACTS_DIR||'/tmp','butler-iphone-mic-'+engine+'.png')});
   }
  }
  for(const name of ['NotAllowedError','AbortError']){
   await page.goto(base+'/?error='+name);await page.getByRole('button',{name:'Start talking',exact:true}).click();await page.locator('.lk-recovery').waitFor();
   assert.match(await page.locator('.lk-recovery').innerText(),name==='NotAllowedError'?/access was blocked/:/startup was interrupted/);
  }
  await page.goto(base+'/?delay=1200');await page.evaluate(()=>{window.failure=null});
  await page.getByRole('button',{name:'Start talking',exact:true}).click();await page.waitForFunction(()=>window.streams.length>0);
  await page.evaluate(()=>{window.hangCancel=true});
  await page.getByRole('button',{name:'Cancel recording',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true,'cancel releases a captured mic before the connection finishes');
  await page.waitForTimeout(1300);assert.equal(await page.locator('.lk-recovery').count(),0,'intentional cancellation is not a capture error');
  await page.goto(base+'/?mode=auto');await page.getByRole('button',{name:'Start listening',exact:true}).click();await page.locator('.lk-recovery').waitFor();
  await page.waitForFunction(()=>window.serverMode==='manual');assert.equal(await page.locator('.lk-recovery').count(),1,'capture failure restores the dormant server mode');
  assert.deepEqual(errors,[]);console.log(engine+' PASS: full card capture-in-tap, accurate failures, single recovery, text/retry/cancel and mobile widths');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exit(1)});
