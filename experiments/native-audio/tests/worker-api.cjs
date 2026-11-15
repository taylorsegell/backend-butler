const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const requireCard=require('node:module').createRequire(path.resolve(__dirname,'../../../apps/dashboard-card/package.json'));
const ts=requireCard('typescript');const context={exports:{},URL};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../worker-api.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,context);
(async()=>{
 const calls=[];let status=200;const hass={callWS:async message=>{calls.push(message);return {status,body:{items:[]}}}};
 await context.exports.workerApi(hass,'GET','backend_butler/chat/history?conversation_id=DB_test');
 assert.equal(calls[0].operation,'history');assert.equal(calls[0].data.conversation_id,'DB_test');
 await context.exports.workerApi(hass,'POST','backend_butler/chat',{new:true});assert.equal(calls[1].operation,'send');
 await assert.rejects(context.exports.workerApi(hass,'GET','backend_butler/chat/delete'));
 const beforeWarm=calls.length;
 assert.equal((await context.exports.workerApi(hass,'POST','backend_butler/chat/warm')).warming,false);
 assert.equal(calls.length,beforeWarm,'native UI must not warm a competing text session');
 status=404;await assert.rejects(context.exports.workerApi(hass,'GET','backend_butler/chat/history'),error=>error.status_code===404);
 console.log('PASS: unchanged history UI routes, selected conversation encoding, method allowlist and HTTP errors');
})().catch(error=>{console.error(error);process.exit(1)});
