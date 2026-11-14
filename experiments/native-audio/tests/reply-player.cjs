const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const requireCard = require('node:module').createRequire(path.resolve(__dirname, '../../../apps/dashboard-card/package.json'));
const ts = requireCard('typescript');
let stops = 0, failures = 0;
const sources = [];
class FakeAudioContext {
  state = 'suspended'; currentTime = 0;
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
  createBuffer(_channels, count, rate) { return { duration: count / rate, getChannelData: () => new Float32Array(count) }; }
  createBufferSource() { const source = { connect() {}, disconnect() {}, start(time) { this.time = time; }, stop() { stops++; } }; sources.push(source); return source; }
}
const sandbox = { exports: {}, AudioContext: FakeAudioContext, atob, DataView, Uint8Array, Float32Array };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../reply-player.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, sandbox);
(async () => {
  const player = new sandbox.exports.ReplyPlayer();
  const frame = { pcm: Buffer.alloc(960).toString('base64'), sample_rate: 24000, channels: 1 };
  player.onFailure = () => failures++;
  player.push(frame); assert.equal(failures, 1); assert.equal(player.blocked, true);
  await player.unlock(); assert.equal(player.blocked, false);
  player.push(frame); player.push(frame);
  assert.equal(sources.length, 2); assert.ok(sources[1].time > sources[0].time, 'PCM chunks play in order');
  player.stop(); assert.equal(stops, 2);
  player.muted = true; player.push(frame); assert.equal(sources.length, 2);
  await player.close(); assert.equal(player.context, undefined);
  console.log('PASS: blocked playback recovery, ordered PCM scheduling, stop, mute, and disposal');
})().catch(error => { console.error(error); process.exit(1); });
