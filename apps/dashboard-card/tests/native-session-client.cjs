const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const requireCard = require('node:module').createRequire(path.resolve(__dirname, '../package.json'));
const ts = requireCard('typescript');
const scope = {exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/native-session-client.ts'),'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,scope);
(async()=>{
 const calls=[];let opened=0;
 const make=()=>new scope.exports.SessionClient(async message=>{
  calls.push(message);
  if(message.type.endsWith('/open')){await new Promise(r=>setTimeout(r,0));return {session_id:(++opened).toString(16).padStart(32,'0')}}
  return {};
 });
 const a=make(),b=make();
 await Promise.all([a.call({type:'backend_butler/native/prepare'}),a.call({type:'backend_butler/native/control',command:'connect'})]);
 assert.equal(opened,1,'parallel mic and connect share exactly one session');
 await b.call({type:'backend_butler/native/prepare'});
 assert.equal(opened,2,'separate cards open independent sessions');
 const status=await a.message({type:'backend_butler/native/status',session_id:'spoofed'});
 assert.equal(status.session_id,'1'.padStart(32,'0'),'caller cannot override the card session');
 const other=await b.message({type:'backend_butler/native/status'});
 assert.notEqual(status.session_id,other.session_id);
 await Promise.all([a.call({type:'backend_butler/native/control',command:'disconnect'}),a.call({type:'backend_butler/native/control',command:'disconnect'})]);
 assert.equal(calls.filter(message=>message.command==='disconnect').length,1,'concurrent unmount/end only close once');
 const countBeforeLate=opened;
 await a.call({type:'backend_butler/native/control',command:'set_audio_output',payload:'on'});
 assert.equal(opened,countBeforeLate,'late settings updates cannot resurrect a closed conversation');
 await a.call({type:'backend_butler/native/prepare'});
 const next=await a.message({type:'backend_butler/native/status'});
 assert.notEqual(next.session_id,status.session_id,'new connection cannot reuse closed session');
 console.log('PASS: per-card sessions, single-flight open, request binding, disposal and replacement');
})().catch(error=>{console.error(error);process.exit(1)});
