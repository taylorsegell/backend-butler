export type VoiceStartStage = 'capture' | 'connection' | 'cancelled';

export class VoiceStartError extends Error {
  constructor(public readonly stage: VoiceStartStage, public readonly reason?: unknown) {
    super(`Voice startup failed: ${stage}`);
    this.name = 'VoiceStartError';
  }
}

/** Request capture in the initiating tap, before any asynchronous connection work. */
export async function startMicrophone<T extends { stop(): void }>(options: {
  acquire(): Promise<T>;
  connect(): Promise<boolean>;
  isCurrent(): boolean;
  publish(track: T): Promise<unknown>;
  unpublish(track: T): Promise<unknown>;
  start(): Promise<unknown>;
}): Promise<void> {
  let track: T | undefined;
  let publishing = false;
  let capture: Promise<T>;
  try {
    capture = options.acquire().then(value => { track = value; return value; }, reason => {
      throw reason instanceof VoiceStartError ? reason : new VoiceStartError('capture', reason);
    });
  } catch (reason) {
    throw reason instanceof VoiceStartError ? reason : new VoiceStartError('capture', reason);
  }
  try {
    const connection = options.connect().then(connected => {
      if (!options.isCurrent()) throw new VoiceStartError('cancelled');
      if (!connected) throw new VoiceStartError('connection');
    });
    const [acquired] = await Promise.all([capture, connection]);
    if (!options.isCurrent()) throw new VoiceStartError('cancelled');
    publishing = true;
    await options.publish(acquired);
    if (!options.isCurrent()) throw new VoiceStartError('cancelled');
    await options.start();
    if (!options.isCurrent()) throw new VoiceStartError('cancelled');
  } catch (error) {
    if (track) {
      track.stop();
      if (publishing) {
        try { await options.unpublish(track); }
        catch (cleanupError) { console.error('Microphone cleanup failed', cleanupError); }
      }
    } else {
      // A permission prompt can resolve after connection failure or cancellation.
      void capture.then(acquired => acquired.stop(), () => {});
    }
    throw error instanceof VoiceStartError ? error : new VoiceStartError('connection', error);
  }
}

export interface MicrophoneFailure { title: string; message: string; code: string; diagnostic: string }

export function microphoneFailure(error: unknown, native = false): MicrophoneFailure {
  const code = error && typeof error === 'object' && 'name' in error && typeof error.name === 'string'
    ? error.name : 'UnknownError';
  const fallback = {
    title: 'Microphone couldn’t start',
    message: 'Retry the microphone. If this continues, reopen Home Assistant. You can still type.',
  };
  const failures: Record<string, { title: string; message: string }> = {
    NotAllowedError: {
      title: 'Microphone access was blocked',
      message: 'The app or browser blocked capture. If Home Assistant already has microphone access, reopen it and retry. You can still type.',
    },
    NotReadableError: {
      title: 'Microphone couldn’t start',
      message: 'The audio device may be busy. Close other recording apps, then retry. You can still type.',
    },
    NotFoundError: {
      title: 'No microphone was found',
      message: 'Check the phone or headset microphone, then retry. You can still type.',
    },
    AbortError: {
      title: 'Microphone startup was interrupted',
      message: 'Retry the microphone. If this continues, reopen Home Assistant. You can still type.',
    },
    NotSupportedError: {
      title: 'Microphone capture is unavailable',
      message: 'Open Home Assistant over HTTPS in the app or a supported browser. You can still type.',
    },
  };
  if (native) failures.NotSupportedError = {
    title: 'Native microphone is unavailable',
    message: 'This Companion app build does not expose the native microphone bridge required by this experiment. Share the diagnostic details from this lab.',
  };
  const detail = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message.replace(/\s+/g, ' ').slice(0, 180) : '';
  const failure = Object.prototype.hasOwnProperty.call(failures, code) ? failures[code] : fallback;
  return { ...failure, code, diagnostic: detail ? `${code}: ${detail}` : code };
}
