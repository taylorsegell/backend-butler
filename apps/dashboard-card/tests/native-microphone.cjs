const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const sandbox = { exports: {}, DOMException, EventTarget, console };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/native-microphone.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText, sandbox);
const { NativeMicrophone } = sandbox.exports;
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b}); return {promise,resolve,reject}; };
const fixture = () => {
 const pending=deferred(), calls=[], target=new EventTarget(), active=[], stopped=[];
 const external={config:{webrtc:{hasCameraMicrophoneStream:true}},sendMessage: message => {calls.push(message);return pending.promise},fireMessage: message => calls.push(message)};
 const mic=new NativeMicrophone(external,'camera.butler_native_audio_0123456789abcdef0123456789abcdef',value=>active.push(value),value=>stopped.push(value),target);
 return {mic,pending,calls,target,active,stopped};
};
(async()=>{
 const f=fixture();const start=f.mic.start();
 assert.equal(f.calls[0].type,'webrtc/stream/start');assert.equal(f.calls[0].payload.entity_id,'camera.butler_native_audio_0123456789abcdef0123456789abcdef');
 assert.deepEqual(f.active,[],'request is not evidence that capture started');
 f.pending.resolve({session_id:'owned'});await start;assert.deepEqual(f.active,[true]);f.mic.stop();f.mic.stop();
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls.filter(x=>x.type==='webrtc/stream/stop'))),[{type:'webrtc/stream/stop',payload:{session_id:'owned'}}]);
 assert.deepEqual(f.active,[true,false]);
 const late=fixture();const lateStart=late.mic.start();late.mic.stop();late.pending.resolve({session_id:'late'});
 await assert.rejects(lateStart,e=>e.name==='AbortError');assert.equal(late.active.includes(true),false);
 assert.equal(late.calls.at(-1).payload.session_id,'late','late grants are stopped');
 const interrupted=fixture();const interruptionStart=interrupted.mic.start();interrupted.pending.resolve({session_id:'current'});await interruptionStart;
 function emit(detail){const event=new Event('webrtc-stream-stopped');Object.defineProperty(event,'detail',{value:detail});interrupted.target.dispatchEvent(event)}
 emit({session_id:'foreign',code:'interrupted'});assert.deepEqual(interrupted.stopped,[]);
 emit({session_id:'current',code:'interrupted'});assert.equal(interrupted.stopped.length,1);assert.deepEqual(interrupted.active,[true,false]);
 const missing=new NativeMicrophone(undefined,'camera.butler_native_audio_0123456789abcdef0123456789abcdef',()=>{},()=>{},new EventTarget());
 await assert.rejects(missing.start(),e=>e.name==='NotSupportedError');
 const denied=fixture();const deniedStart=denied.mic.start();denied.pending.reject({code:'microphone_denied',message:'Synthetic denial'});
 await assert.rejects(deniedStart,e=>e.name==='NotAllowedError');
 const arbitrary=new NativeMicrophone({config:{webrtc:{hasCameraMicrophoneStream:true}},sendMessage:()=>{throw Error('must not run')},fireMessage:()=>{}},'camera.doorbell',()=>{},()=>{},new EventTarget());
 await assert.rejects(arbitrary.start(),e=>e.name==='NotSupportedError');
 assert.equal(f.calls.some(x=>x.type==='assist/show'),false);
 console.log('PASS: native bridge capability, honest startup, stop, late grants, interruption and denial');
})().catch(error=>{console.error(error);process.exit(1)});
