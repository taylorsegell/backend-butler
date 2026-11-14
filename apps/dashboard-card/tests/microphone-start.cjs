const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/microphone-start.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
const sandbox={exports:{},console};vm.runInNewContext(code,sandbox);
const {startMicrophone,microphoneFailure}=sandbox.exports;
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
(async()=>{
 let calls=[],stops=0,current=true;const track={stop(){stops++}};
 const connection=deferred();const opts={acquire(){calls.push('capture');return Promise.resolve(track)},connect(){calls.push('connect');return connection.promise},isCurrent:()=>current,publish:async()=>calls.push('publish'),unpublish:async()=>calls.push('unpublish'),start:async()=>calls.push('start')};
 const pending=startMicrophone(opts);assert.deepEqual(calls,['capture','connect'],'capture must be requested synchronously before waiting for a connection');connection.resolve(true);await pending;assert.deepEqual(calls,['capture','connect','publish','start']);assert.equal(stops,0);
 calls=[];stops=0;current=false;await assert.rejects(startMicrophone({...opts,connect:async()=>true}),e=>e.stage==='cancelled');assert.equal(stops,1);assert.ok(!calls.includes('publish'));
 current=true;calls=[];stops=0;await assert.rejects(startMicrophone({...opts,connect:async()=>false}),e=>e.stage==='connection');assert.equal(stops,1);
 const late=deferred();stops=0;await assert.rejects(startMicrophone({...opts,acquire:()=>late.promise,connect:async()=>{throw Error('offline')}}),e=>e.stage==='connection');late.resolve(track);await new Promise(r=>setTimeout(r,0));assert.equal(stops,1,'a late permission grant after connection failure must release the microphone');
 stops=0;calls=[];await assert.rejects(startMicrophone({...opts,connect:async()=>true,publish:async()=>{throw Error('publish failed')}}),e=>e.stage==='connection');assert.equal(stops,1);assert.ok(calls.includes('unpublish'));
 for(const name of ['NotAllowedError','NotReadableError','NotFoundError','AbortError']){
  await assert.rejects(startMicrophone({...opts,acquire:()=>Promise.reject({name}),connect:async()=>true}),e=>e.stage==='capture'&&e.reason.name===name);
 }
 assert.match(microphoneFailure({name:'NotAllowedError'}).title,/blocked/i);
 assert.doesNotMatch(microphoneFailure({name:'NotReadableError'}).message,/allow microphone|permission/i);
 assert.match(microphoneFailure({name:'AbortError'}).title,/interrupted/i,'capture abort must not be confused with deliberate cancellation');
 assert.equal(microphoneFailure({name:'NotReadableError'}).code,'NotReadableError');
 console.log('PASS: gesture-first capture, cancellation, failed/late cleanup and accurate microphone failures');
})().catch(e=>{console.error(e);process.exit(1)});
