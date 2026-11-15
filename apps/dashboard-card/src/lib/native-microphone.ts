/** Experimental iOS camera-microphone bridge; never launches native Assist. */
export interface NativeExternalMessaging {
  config: { webrtc?: { hasCameraMicrophoneStream?: boolean } };
  sendMessage(message: { type: string; payload: Record<string, string> }): Promise<{ session_id: string }>;
  fireMessage(message: { type: string; payload: Record<string, string> }): void;
}

export class NativeMicrophone {
  private sessionId: string | null = null;
  private disposed = false;
  private active = false;
  private interrupted = new Set<string>();

  constructor(
    private readonly external: NativeExternalMessaging | undefined,
    private readonly entityId: string,
    private readonly onActive: (active: boolean) => void,
    private readonly onStopped: (detail: { code: string; message?: string }) => void,
    private readonly target: EventTarget = window,
  ) {}

  private readonly interruptedByApp = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail || typeof detail.session_id !== 'string') return;
    if (!this.sessionId) { this.interrupted.add(detail.session_id); return; }
    if (detail.session_id !== this.sessionId) return;
    this.sessionId = null; // The native app already stopped it.
    this.stop();
    this.onStopped({ code: typeof detail.code === 'string' ? detail.code : 'interrupted' });
  };

  async start(): Promise<this> {
    if (this.disposed) throw new DOMException('Native capture was cancelled', 'AbortError');
    if (!this.external?.config.webrtc?.hasCameraMicrophoneStream) {
      throw new DOMException('This Companion app does not expose native microphone streaming', 'NotSupportedError');
    }
    if (!/^camera\.butler_native_audio_[0-9a-f]{32}$/.test(this.entityId)) {
      throw new DOMException('The experimental microphone receiver is not configured', 'NotSupportedError');
    }
    this.target.addEventListener('webrtc-stream-stopped', this.interruptedByApp);
    try {
      const result = await this.external.sendMessage({
        type: 'webrtc/stream/start', payload: { stream_type: 'microphone', entity_id: this.entityId },
      });
      if (!result || typeof result.session_id !== 'string' || !result.session_id) {
        throw new Error('Native microphone returned no session');
      }
      if (this.disposed || this.interrupted.has(result.session_id)) {
        this.external.fireMessage({ type: 'webrtc/stream/stop', payload: { session_id: result.session_id } });
        throw new DOMException('Native capture was cancelled', 'AbortError');
      }
      this.sessionId = result.session_id;
      this.active = true;
      this.onActive(true);
      return this;
    } catch (error) {
      this.stop();
      if (error && typeof error === 'object' && 'code' in error && error.code === 'microphone_denied') {
        throw new DOMException('The Companion app denied microphone access', 'NotAllowedError');
      }
      throw error;
    }
  }

  stop(): void {
    this.disposed = true;
    this.target.removeEventListener('webrtc-stream-stopped', this.interruptedByApp);
    if (this.sessionId) {
      const sessionId = this.sessionId;
      this.sessionId = null;
      this.external?.fireMessage({ type: 'webrtc/stream/stop', payload: { session_id: sessionId } });
    }
    if (this.active) { this.active = false; this.onActive(false); }
    this.interrupted.clear();
  }
}
