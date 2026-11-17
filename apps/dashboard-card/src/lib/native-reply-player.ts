/** PCM replies stay in memory and play inside the existing Butler card. */
export class ReplyPlayer {
  context: AudioContext | undefined;
  private cursor = 0;
  private nodes = new Set<AudioBufferSourceNode>();
  private envelopes = new Map<AudioBufferSourceNode, { start: number; end: number; levels: number[]; window: number }>();

  /** RMS of the PCM currently playing, never of buffered/future or muted audio. */
  getLevel = (): number => {
    if (this.muted || this.blocked || this.context?.state !== 'running') return 0;
    const now = this.context.currentTime;
    let level = 0;
    for (const envelope of this.envelopes.values()) {
      if (now >= envelope.start && now < envelope.end) {
        level = Math.max(level, envelope.levels[Math.floor((now - envelope.start) / envelope.window)] ?? 0);
      }
    }
    return level;
  };
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
    const windowSamples = Math.max(1, Math.round(event.sample_rate * .02));
    const levels: number[] = [];
    for (let offset = 0; offset < output.length; offset += windowSamples) {
      const end = Math.min(output.length, offset + windowSamples);
      let sum = 0;
      for (let i = offset; i < end; i++) sum += output[i] * output[i];
      levels.push(Math.min(1, Math.sqrt(sum / (end - offset))));
    }
    const start = Math.max(context.currentTime + 0.03, this.cursor);
    if (start - context.currentTime > 30) { this.stop(); this.onFailure?.(); return; }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => { source.disconnect(); this.nodes.delete(source); this.envelopes.delete(source); if (!this.nodes.size) this.onPlaying?.(false); };
    this.nodes.add(source);
    this.envelopes.set(source, { start, end: start + buffer.duration, levels, window: windowSamples / event.sample_rate });
    this.onPlaying?.(true);
    source.start(start);
    this.scheduledFrames++;
    this.cursor = start + buffer.duration;
  }

  stop() {
    for (const node of this.nodes) { node.stop(); node.disconnect(); }
    this.nodes.clear();
    this.envelopes.clear();
    this.onPlaying?.(false);
    this.cursor = 0;
  }

  async close() {
    this.stop();
    await this.context?.close();
    this.context = undefined;
  }
}
