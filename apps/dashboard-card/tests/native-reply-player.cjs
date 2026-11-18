const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const requireCard = require('node:module').createRequire(path.resolve(__dirname, '../package.json'));
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
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/native-reply-player.ts'), 'utf8'), {
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
  const tone = { ...frame, pcm: Buffer.alloc(960, 64).toString('base64') };
  player.push(tone);
  assert.equal(player.getLevel(), 0, 'queued audio is not yet audible');
  player.context.currentTime = sources[2].time + .005;
  assert.ok(player.getLevel() > 0, 'level follows real PCM while scheduled playback is audible');
  player.muted = true;assert.equal(player.getLevel(),0,'mute reports silence');player.muted = false;
  player.context.state = 'suspended';assert.equal(player.getLevel(),0,'blocked playback reports silence');player.context.state = 'running';
  const finished = [];
  player.onFinished = segment => finished.push(segment);
  player.finish(1);
  assert.deepEqual(finished, [], 'sending the last chunk does not finish device playback');
  sources[0].onended();
  assert.deepEqual(finished, [], 'earlier queued audio cannot acknowledge the final chunk');
  sources[2].onended();
  assert.deepEqual(finished, [1], 'completion follows the last audio source ending');
  player.finish(2);
  player.stop();
  assert.deepEqual(finished, [1, 2], 'local mute acknowledges audio that was stopped');
  sources[1].onended();
  assert.deepEqual(finished, [1, 2], 'late onended after stop cannot acknowledge a segment twice');
  player.finish(3);
  assert.deepEqual(finished, [1, 2, 3], 'muted or empty playback completes without waiting for nonexistent sound');
  assert.equal(stops, 1);assert.equal(player.getLevel(),0,'stop clears the envelope');
  player.muted = true; player.push(frame); assert.equal(sources.length, 3);
  await player.close(); assert.equal(player.context, undefined);
  console.log('PASS: blocked playback recovery, ordered PCM scheduling, stop, mute, and disposal');
})().catch(error => { console.error(error); process.exit(1); });
