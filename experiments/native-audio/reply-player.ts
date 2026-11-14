/** PCM replies stay in memory and play inside the existing Butler card. */
export class ReplyPlayer {
  context: AudioContext | undefined;
  private cursor = 0;
  private nodes = new Set<AudioBufferSourceNode>();
  muted = false;
  blocked = false;
  receivedFrames = 0;
  scheduledFrames = 0;
  onPlaying: ((playing: boolean) => void) | undefined;
  onFailure: (() => void) | undefined;

  async unlock() {
    this.context ??= new AudioContext();
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Reply audio is blocked');
    this.blocked = false;
  }

  push(event: { pcm: string; sample_rate: number; channels: number }) {
    this.receivedFrames++;
    if (this.muted) return;
    const context = this.context;
    if (!context || context.state !== 'running') { this.blocked = true; this.onFailure?.(); return; }
    const raw = atob(event.pcm);
    if (raw.length > 100000 || raw.length % 2 || event.channels !== 1 || event.sample_rate < 8000 || event.sample_rate > 48000) return;
    const data = new DataView(Uint8Array.from(raw, c => c.charCodeAt(0)).buffer);
    const buffer = context.createBuffer(1, data.byteLength / 2, event.sample_rate);
    const output = buffer.getChannelData(0);
    for (let n = 0; n < output.length; n++) output[n] = data.getInt16(n * 2, true) / 32768;
    const start = Math.max(context.currentTime + 0.03, this.cursor);
    if (start - context.currentTime > 30) { this.stop(); this.onFailure?.(); return; }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => { source.disconnect(); this.nodes.delete(source); if (!this.nodes.size) this.onPlaying?.(false); };
    this.nodes.add(source);
    this.onPlaying?.(true);
    source.start(start);
    this.scheduledFrames++;
    this.cursor = start + buffer.duration;
  }

  stop() {
    for (const node of this.nodes) { node.stop(); node.disconnect(); }
    this.nodes.clear();
    this.onPlaying?.(false);
    this.cursor = 0;
  }

  async close() {
    this.stop();
    await this.context?.close();
    this.context = undefined;
  }
}
