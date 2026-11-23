const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const esbuild=require('esbuild');
(async()=>{
 const built=await esbuild.build({entryPoints:[path.join(__dirname,'fixtures/microphone-card.tsx')],bundle:true,write:false,format:'iife',jsx:'automatic',logLevel:'silent',plugins:[...(process.env.BASELINE_APP?[{name:'baseline-app',setup(build){build.onLoad({filter:/\/src\/App\.tsx$/},args=>({contents:fs.readFileSync(process.env.BASELINE_APP,'utf8'),loader:'tsx',resolveDir:path.dirname(args.path)}))}}]:[]),{name:'isolated-session',setup(build){build.onResolve({filter:/^@livekit\/components-react$/},()=>({path:path.join(__dirname,'fixtures/microphone-session.tsx')}))}}]});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?built.outputFiles[0].contents:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#181818;color:#eee}</style><body><script src="/fixture.js"></script>')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const engine=process.env.ENGINE||'chromium';let browser;
 try{
  browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,args:engine==='chromium'?['--no-sandbox']:[]});
  const page=await browser.newPage();
  await page.addInitScript(()=>{
   const draw=WebGLRenderingContext.prototype.drawArrays;
   WebGLRenderingContext.prototype.drawArrays=function(...args){
    const result=draw.apply(this,args);const pixel=new Uint8Array(4);this.readPixels(0,0,1,1,this.RGBA,this.UNSIGNED_BYTE,pixel);
    window.brandCorner=[...pixel];window.brandPremultiplied=this.getContextAttributes().premultipliedAlpha;return result;
   };
  });page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>{errors.push(String(e));console.error('Fixture page error:',String(e))});
  const captures=process.env.ARTIFACTS_DIR||'/tmp/butler-live-session-captures';fs.mkdirSync(captures,{recursive:true});
  await page.setViewportSize({width:402,height:874});await page.goto(base+'/?mode=default&delay=0');
  await page.getByRole('button',{name:'Start call',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.captureRequests),0,'continuous default still waits for an explicit start');
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);await page.screenshot({path:path.join(captures,'phone-call-ready.png')});
  await page.evaluate(()=>{window.failure=null});await page.getByRole('button',{name:'Start call',exact:true}).click();
  await page.getByRole('button',{name:'Pause listening',exact:true}).waitFor();await page.waitForFunction(()=>window.streams.length===1);
  assert.equal(await page.getByRole('button',{name:'Send recording',exact:true}).count(),0,'a call does not require Send');
  await page.screenshot({path:path.join(captures,'phone-continuous-listening.png')});
  await page.evaluate(()=>{
   window.emitConversation([{kind:'message',id:'call-user',role:'user',text:'Can we keep talking without pressing Send?',ts:1},{kind:'message',id:'call-agent',role:'agent',text:'Yes. The call stays open between replies.',ts:2}]);
   window.emitSpeech(true,true,true);window.dispatchEvent(new CustomEvent('fixture-agent',{detail:'speaking'}));
  });
  await page.locator('.lk-call-status').getByText('Speaking',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Cancel recording',exact:true}).count(),0);
  await page.screenshot({path:path.join(captures,'phone-continuous-speaking.png')});
  const callCancels=await page.evaluate(()=>window.rpcCalls.filter(m=>m==='cancel_turn').length);
  await page.getByRole('button',{name:'Stop reply audio',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.rpcCalls.filter(m=>m==='cancel_turn').length),callCancels,'interrupting speech must not pause continuous capture');
  assert.equal(await page.evaluate(()=>window.streams.every(s=>s.getTracks().every(t=>t.readyState==='live'))),true);
  await page.getByRole('button',{name:'Pause listening',exact:true}).waitFor();
  await page.getByRole('button',{name:'Transcript',exact:true}).click();await page.getByRole('button',{name:'Live view',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.captureRequests),1,'same microphone continues across views');
  await page.getByRole('button',{name:'Pause listening',exact:true}).click();
  await page.waitForFunction(()=>window.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
  await page.getByRole('button',{name:'Resume listening',exact:true}).click();await page.waitForFunction(()=>window.streams.length===2);
  await page.getByRole('button',{name:'End voice session',exact:true}).click();
  await page.waitForFunction(()=>window.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
  console.log(engine+' PASS: explicit-start continuous default, no Send, same capture across views, Pause/Resume/End release');
  await page.goto(base+'/?delay=0');
  await page.getByRole('button',{name:'Transcript',exact:true}).waitFor();
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(260);await page.screenshot({path:path.join(captures,'phone-ready.png')});
  assert.equal(await page.evaluate(()=>document.fonts.check('650 25px ButlerManrope')),true,'the actual Manrope face is registered outside the shadow root');
  assert.ok(await page.evaluate(()=>[...document.fonts].some(face=>face.family==='ButlerManrope'&&face.status==='loaded')));
  assert.equal(await page.evaluate(()=>window.brandPremultiplied),true,'the canvas must use premultiplied alpha for WKWebView compositing');
  assert.deepEqual(await page.evaluate(()=>window.brandCorner),[0,0,0,0],'transparent logo corners must contain no orange RGB');
  assert.equal(await page.locator('.lk-brand-glow').getAttribute('data-renderer'),'webgl','production brand renderer succeeds');
  assert.equal(await page.locator('.lk-live-stage').isVisible(),true,'Live opens first');
  await page.getByRole('button',{name:'Transcript',exact:true}).click();
  await page.locator('textarea').fill('A draft across views');
  await page.getByRole('button',{name:'Live view',exact:true}).click();
  await page.getByRole('button',{name:'Transcript',exact:true}).click();
  assert.equal(await page.locator('textarea').inputValue(),'A draft across views');
  assert.equal(await page.evaluate(()=>window.captureRequests),0,'view changes never acquire a microphone');
  await page.evaluate(()=>{window.failure=null});
  await page.getByRole('button',{name:'Start talking',exact:true}).click();
  await page.getByRole('button',{name:'Send recording',exact:true}).waitFor();
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(260);await page.screenshot({path:path.join(captures,'phone-transcript.png')});
  const before=await page.evaluate(()=>({starts:window.sessionStarts,capture:window.captureRequests,id:window.currentConversation()}));
  await page.getByRole('button',{name:'Live view',exact:true}).click();
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(260);await page.screenshot({path:path.join(captures,'phone-listening.png')});
  await page.getByRole('button',{name:'Transcript',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>({starts:window.sessionStarts,capture:window.captureRequests,id:window.currentConversation()})),before,'view switches preserve session, capture, and history identity');
  assert.equal(await page.evaluate(()=>window.streams.every(s=>s.getTracks().every(t=>t.readyState==='live'))),true);
  await page.getByRole('button',{name:'Cancel recording',exact:true}).click();
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(260);await page.screenshot({path:path.join(captures,'desktop-transcript.png')});
  await page.getByRole('button',{name:'Live view',exact:true}).click();
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(260);await page.screenshot({path:path.join(captures,'desktop-live.png')});
  console.log(engine+' PASS: Live-first, shared draft, session, microphone and selected history across view changes');
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
   for(const button of await page.locator('.lk-call-controls button').all()) {
    const box=await button.boundingBox();assert.ok(box.width>=44&&box.height>=44,'call controls retain touch targets');
    assert.ok(box.y+box.height<=874,'call controls remain on screen during recovery');
   }
   await recovery.getByText('Diagnostic details',{exact:true}).click();await recovery.getByText('Microphone capture: NotReadableError: Synthetic capture failure',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Transcript',exact:true}).click();const input=page.locator('textarea');await input.fill('Text still works');await page.waitForTimeout(50);assert.equal(await input.evaluate(el=>el.getRootNode().activeElement===el),true,'view change must not steal typing focus');await input.press('Enter');await page.waitForFunction(()=>window.typedMessages.includes('Text still works')).catch(async error=>{console.error({layout,width,text:await page.locator('.lk-root').innerText(),state:await page.evaluate(()=>({typed:window.typedMessages,starts:window.sessionStarts,ends:window.sessionEnds}))});throw error;});
   await page.evaluate(()=>{window.failure=null});
   await page.getByRole('button',{name:'Start talking',exact:true}).click();await page.getByRole('button',{name:'Send recording',exact:true}).waitFor();await page.waitForFunction(()=>window.streams.length>0);
   await page.getByRole('button',{name:'Cancel recording',exact:true}).click();
   await page.waitForFunction(()=>window.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
   if(width===402&&layout==='fullpage'){
    await page.evaluate(()=>{window.failure='NotReadableError'});await page.getByRole('button',{name:'Start talking',exact:true}).click();await page.locator('.lk-recovery').waitFor();
    await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(260);await page.screenshot({path:path.join(process.env.ARTIFACTS_DIR||'/tmp','butler-iphone-mic-'+engine+'.png')});
   }
  }
  await page.setViewportSize({width:320,height:640});await page.goto(base+'/?layout=fullpage');
  await page.getByRole('button',{name:'Start talking',exact:true}).click();await page.locator('.lk-recovery').waitFor();
  for(const button of await page.locator('.lk-call-controls button').all()){const box=await button.boundingBox();assert.ok(box.y+box.height<=640,'small phone recovery keeps controls visible');}
  await page.screenshot({path:path.join(captures,'small-phone-error.png')});
  await page.setViewportSize({width:402,height:874});
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
  for(const captureDelay of [0,300]){
   await page.goto(base+'/?delay=1200');await page.evaluate(delay=>{window.failure=null;window.captureDelay=delay},captureDelay);
   await page.getByRole('button',{name:'Start talking',exact:true}).click();
   if(!captureDelay)await page.waitForFunction(()=>window.streams.length>0);
   await page.evaluate(()=>window.unmount());
   await page.waitForFunction(()=>window.streams.length>0&&window.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
  }
  await page.goto(base+'/?mode=auto');await page.getByRole('button',{name:'Start call',exact:true}).click();await page.locator('.lk-recovery').waitFor();
  await page.waitForFunction(()=>window.serverMode==='manual');assert.equal(await page.locator('.lk-recovery').count(),1,'capture failure restores the dormant server mode');
  for(const autoConnect of [false,true]){
  await page.goto(base+'/?delay=0'+(autoConnect?'&connect=auto':''));await page.evaluate(()=>{window.failure=null});
  await page.getByRole('button',{name:'Start talking',exact:true}).click();
  await page.getByRole('button',{name:'Send recording',exact:true}).waitFor();
  await page.getByText('A synthetic test conversation.',{exact:true}).first().waitFor();
  await page.evaluate(()=>window.emitIdle());
  await page.waitForFunction(()=>window.sessionEnds===1&&window.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
  assert.equal(await page.locator('.lk-recovery').count(),0,'idle is a normal disconnect, not an error');
  await page.locator('.lk-call-status').getByText('Session ended after inactivity',{exact:true}).waitFor();
  await page.screenshot({path:path.join(captures,'phone-idle-ended.png')});
  await page.getByText('A synthetic test conversation.',{exact:true}).first().waitFor();
  assert.equal(await page.evaluate(()=>window.currentConversation()),'synthetic-conversation','idle preserves selected saved history');
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.sessionStarts),1,'idle does not automatically reconnect');
  await page.getByRole('button',{name:'Start talking',exact:true}).click();
  await page.getByRole('button',{name:'Send recording',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.sessionStarts),2,'the next explicit tap reconnects');
  assert.equal(await page.evaluate(()=>window.currentConversation()),'synthetic-conversation');
  await page.getByRole('button',{name:'Cancel recording',exact:true}).click();
  }
  // Synthetic remote captions exercise the real conversation reducer and session-derived states.
  await page.evaluate(()=>{
   window.emitConversation([{kind:'message',id:'user-1',role:'user',text:'Can I read the transcript while we talk?',ts:1},{kind:'message',id:'reply-1',role:'agent',text:'Yes. This synthetic reply stays in the same conversation when you open the transcript.',ts:2}]);
   window.dispatchEvent(new CustomEvent('fixture-agent',{detail:'thinking'}));
  });
  await page.locator('.lk-call-status').getByText('Working on your request',{exact:true}).waitFor();
  await page.screenshot({path:path.join(captures,'phone-thinking.png')});
  await page.getByRole('button',{name:'Transcript',exact:true}).click();
  await page.locator('.lk-call-transcript .lk-bubble').filter({hasText:'Yes. This synthetic reply stays in the same conversation when you open the transcript.'}).waitFor();
  await page.getByRole('button',{name:'Live view',exact:true}).click();
  await page.evaluate(()=>{window.emitSpeech(true);window.dispatchEvent(new CustomEvent('fixture-agent',{detail:'speaking'}))});
  await page.locator('.lk-call-status').getByText('Speaking',{exact:true}).waitFor();
  await page.screenshot({path:path.join(captures,'phone-speaking.png')});
  const cancels=await page.evaluate(()=>window.rpcCalls.filter(m=>m==='cancel_turn').length);
  await page.getByRole('button',{name:'Stop reply audio',exact:true}).click();
  await page.locator('.lk-call-status').getByText('Replying in text',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.rpcCalls.filter(m=>m==='cancel_turn').length),cancels,'Interrupt mutes speech without cancelling home actions');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.screenshot({path:path.join(captures,'phone-reduced-motion.png')});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>window.emitSpeech(true,false));
  await page.getByRole('button',{name:'Enable reply audio',exact:true}).waitFor();
  await page.getByRole('button',{name:'Enable reply audio',exact:true}).click();
  await page.getByRole('button',{name:'Enable reply audio',exact:true}).waitFor({state:'hidden'});
  await page.locator('.lk-call-status').getByText('Speaking',{exact:true}).waitFor();
  await page.evaluate(()=>{
   window.syntheticApprovals=[{id:'synthetic-request',chat_id:'synthetic-conversation',title:'Synthetic approval request',summary:'A fixture-only decision. No home action will run.',preview:{kind:'yaml',text:'alias: synthetic'},expires_at:new Date(Date.now()+60000).toISOString(),status:'pending'}];
  });
  await page.getByRole('button',{name:'Approve: Synthetic approval request',exact:true}).waitFor();
  await page.setViewportSize({width:320,height:640});
  for(const button of await page.locator('.lk-call-controls button').all()){const box=await button.boundingBox();assert.ok(box.y+box.height<=640,'approval keeps call controls visible');}
  await page.screenshot({path:path.join(captures,'small-phone-approval.png')});
  await page.getByRole('button',{name:'Approve: Synthetic approval request',exact:true}).click();
  await page.waitForFunction(()=>window.approvalDecisions.length===1);
  assert.deepEqual(await page.evaluate(()=>window.approvalDecisions),[{id:'synthetic-request',allow:true}]);
  await page.evaluate(()=>{
   window.emitConversation(Array.from({length:50},(_,i)=>({kind:'message',id:'long-'+i,role:i%2?'agent':'user',text:'Synthetic history '+i+' '+('Long transcript content '.repeat(12)),ts:i+1})));
  });
  await page.getByRole('button',{name:'Transcript',exact:true}).click();
  await page.locator('.lk-call-transcript .lk-msg').last().waitFor();
  assert.equal(await page.locator('.lk-call-transcript .lk-msg').count(),50);
  const timeline=page.locator('.lk-call-transcript .lk-convo');
  await timeline.evaluate(el=>{el.scrollTop=150});await page.waitForTimeout(80);
  const scroll=await timeline.evaluate(el=>el.scrollTop);assert.ok(scroll>0,'long transcript scrolls');
  await page.getByRole('button',{name:'Live view',exact:true}).click();await page.getByRole('button',{name:'Transcript',exact:true}).click();await page.waitForTimeout(80);
  assert.equal(await timeline.evaluate(el=>el.scrollTop),scroll,'reading position survives view toggles');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log(engine+' PASS: blocked playback recovery, live approval decisions, long transcript and preserved reading position');
  console.log(engine+' PASS: idle releases microphone without errors, retains selected history, and reconnects only on request');
  assert.deepEqual(errors,[]);console.log(engine+' PASS: full card capture-in-tap, accurate failures, single recovery, text/retry/cancel and mobile widths');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exit(1)});
