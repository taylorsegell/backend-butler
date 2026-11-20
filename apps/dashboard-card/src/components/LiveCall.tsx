import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react';
import type { ConvMessage, ConvItem } from '../lib/conversation';
import type { VoiceFeedbackState } from '../lib/voice-feedback';
import { CallIcon } from './CallIcon';
import { createBrandGlow } from '../lib/brand-glow';
import { BUTLER_JACKET_PATHS, BUTLER_LOGO_VIEWBOX, BUTLER_TIE_PATH } from '../lib/logo';
import type { TurnMode } from '../lib/turn-mode';

/** Presentation only: the session, draft and selected history stay owned by CardShell. */
export function LiveCall({ transcript, onTranscript, feedback, getInputLevel, getOutputLevel, items,
  connected, connecting, micStarting, mode, turnActive, autoPaused, audioEnabled,
  onTalk, onSendRecording, onCancelRecording, onPause, onResume, onAudio, onInterrupt, onEnd,
  onEnableAudio, notice, hasRecovery = false, approvals, transcriptContent,
}: {
  transcript: boolean; onTranscript: (value: boolean) => void;
  feedback: VoiceFeedbackState; getInputLevel: () => number; getOutputLevel: () => number;
  items: ConvItem[]; connected: boolean; connecting: boolean; micStarting: boolean;
  mode: TurnMode; turnActive: boolean; autoPaused: boolean; audioEnabled: boolean;
  onTalk: () => void; onSendRecording: () => void; onCancelRecording: () => void;
  onPause: () => void; onResume: () => void; onAudio: () => void; onInterrupt: () => void;
  onEnd: () => void; onEnableAudio?: () => void;
  notice?: ReactNode; hasRecovery?: boolean; approvals: ReactNode; transcriptContent: ReactNode;
}) {
  const stageId = useId();
  const transcriptId = useId();
  const root = useRef<HTMLDivElement>(null);
  const captions = useRef<HTMLDivElement>(null);
  const captionContent = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const mark = useRef<SVGSVGElement>(null);
  const signals = useRef({ feedback, getInputLevel, getOutputLevel });
  signals.current = { feedback, getInputLevel, getOutputLevel };
  const renderer = useRef<ReturnType<typeof createBrandGlow> | null>(null);
  useEffect(() => {
    renderer.current = createBrandGlow(canvas.current!, mark.current!, () => signals.current.feedback.phase,
      () => signals.current.feedback.phase === 'listening' ? signals.current.getInputLevel()
        : signals.current.feedback.phase === 'speaking' ? signals.current.getOutputLevel() : 0);
    return () => { renderer.current?.dispose(); renderer.current = null; };
  }, []);
  useEffect(() => { renderer.current?.refresh(); }, [feedback.phase, transcript]);
  const switchView = (value: boolean) => {
    onTranscript(value);
  };
  const messages = items.filter((item): item is ConvMessage => item.kind === 'message');
  const latest = messages[messages.length - 1];
  const user = [...messages].reverse().find(item => item.role === 'user');
  // A new user turn must never display an older assistant answer as its reply.
  const reply = latest?.role === 'agent' ? latest : undefined;
  const followCaptions = useCallback(() => {
    const viewport = captions.current;
    if (!viewport?.clientHeight) return;
    const bottom = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    if (Math.abs(viewport.scrollTop - bottom) > 1) viewport.scrollTop = bottom;
  }, []);
  useLayoutEffect(followCaptions, [followCaptions, user?.id, user?.text, reply?.id, reply?.text, transcript]);
  useEffect(() => {
    // Font loading, text reflow and a hidden Live view becoming visible can all
    // change the last line's position without a new transcript arriving.
    // WebKit reports a resize loop if a delivery writes back into the layout
    // being observed. Coalesce resize-driven scrolling into the next frame.
    let frame: number | undefined;
    const observer = new ResizeObserver(() => {
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        followCaptions();
      });
    });
    observer.observe(captions.current!);
    observer.observe(captionContent.current!);
    return () => {
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [followCaptions]);
  const recording = mode === 'manual' && turnActive;
  const listening = mode === 'auto' && !autoPaused;
  const busy = micStarting || connecting;
  const micLabel = recording ? 'Send recording' : listening ? 'Pause listening' : mode === 'auto' ? connected ? 'Resume listening' : 'Start call' : 'Start talking';
  const micAction = recording ? onSendRecording : listening ? onPause : mode === 'auto' ? onResume : onTalk;
  const cancelling = recording || micStarting;
  const cancellingCallStart = micStarting && mode === 'auto';
  return <div className="lk-call" ref={root} data-transcript={transcript ? '1' : '0'} data-phase={feedback.phase}>
    <div className="lk-call-body">
      {/* Both views remain mounted: toggling presentation cannot reset capture, canvas or scroll. */}
      <section className="lk-live-stage" id={stageId} hidden={transcript} aria-label="Live conversation">
        <div className="lk-call-captions" ref={captions} role="region" aria-label="Recent transcript" tabIndex={0}>
          <div ref={captionContent}>
            {user && <p className="lk-call-user">{user.text}</p>}
            <p className="lk-call-reply">{reply?.text || (user ? 'Waiting for Butler’s reply…' : 'What can I help with?')}</p>
          </div>
        </div>
        <div className="lk-call-presence">
          <div className="lk-brand-glow" data-renderer="fallback" aria-hidden="true">
            <canvas ref={canvas} />
            <svg ref={mark} viewBox={BUTLER_LOGO_VIEWBOX} focusable="false">
              {BUTLER_JACKET_PATHS.map((d, i) => <path key={i} d={d} fill="#f2f2f3" />)}<path d={BUTLER_TIE_PATH} fill="#FC6B02" />
            </svg>
          </div>
          {!transcript && !hasRecovery && <CallStatus feedback={feedback} onEnableAudio={onEnableAudio} />}
        </div>
      </section>
      <section className="lk-call-transcript" id={transcriptId} hidden={!transcript} aria-label="Transcript">
        {transcriptContent}
      </section>
    </div>
    {transcript && !hasRecovery && <CallStatus feedback={feedback} onEnableAudio={onEnableAudio} />}
    <div className="lk-call-notices">{approvals}{notice}</div>
    <nav className="lk-call-controls" aria-label="Voice controls">
      <CallButton label={micLabel} caption={micStarting ? 'Starting…' : recording ? 'Send' : listening ? 'Pause' : mode === 'auto' ? connected ? 'Resume' : 'Call' : 'Talk'}
        icon={recording ? 'send' : listening ? 'pause' : 'microphone'}
        primary disabled={busy} onClick={micAction} />
      <CallButton label={audioEnabled ? 'Silence spoken replies' : 'Enable spoken replies'} caption={audioEnabled ? 'Silence' : 'Sound'}
        icon={audioEnabled ? 'sound' : 'muted'} pressed={!audioEnabled} disabled={!connected || busy} onClick={onAudio} />
      <CallButton label={cancellingCallStart ? 'Cancel call start' : cancelling ? 'Cancel recording' : 'Stop reply audio'} caption={cancelling ? 'Cancel' : 'Stop reply'}
        icon={cancelling ? 'close' : 'interrupt'}
        disabled={!cancelling && feedback.phase !== 'speaking'} onClick={cancelling ? (mode === 'auto' ? onPause : onCancelRecording) : onInterrupt} />
      <CallButton className="lk-call-view" label={transcript ? 'Live view' : 'Transcript'} caption={transcript ? 'Live view' : 'Transcript'}
        icon={transcript ? 'live' : 'transcript'} pressed={transcript}
        controls={transcript ? stageId : transcriptId} onClick={() => switchView(!transcript)} />
      <CallButton label="End voice session" caption="End" icon="end" danger disabled={!connected && !connecting && !micStarting} onClick={onEnd} />
    </nav>
    <div className="lk-call-utility">
      <span>{mode === 'manual' ? 'Send when you’re done speaking' : autoPaused ? 'Speak naturally after starting the call' : 'Listening between replies'}</span>
      {!transcript && <button onClick={() => { switchView(true); requestAnimationFrame(() => root.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true })); }}>Type instead</button>}
    </div>
  </div>;
}

function CallButton({ label, caption, icon, onClick, disabled, pressed, primary, danger, className = '', controls }: {
  label: string; caption: string; icon: string; onClick: () => void; disabled?: boolean;
  pressed?: boolean; primary?: boolean; danger?: boolean; className?: string; controls?: string;
}) {
  return <button type="button" className={`lk-call-control ${className}`} aria-label={label} title={label}
    aria-pressed={pressed} aria-controls={controls} disabled={disabled} onClick={onClick}
    data-primary={primary ? '1' : '0'} data-danger={danger ? '1' : '0'}>
    <span className="lk-call-circle"><CallIcon name={icon} /></span><span>{caption}</span>
  </button>;
}

function CallStatus({ feedback, onEnableAudio }: { feedback: VoiceFeedbackState; onEnableAudio?: () => void }) {
  return <div className="lk-call-status">
    <p role="status" aria-live="polite" aria-atomic="true">{feedback.label}</p>
    <p>{feedback.detail}</p>
    {onEnableAudio && <button className="lk-btn" onClick={onEnableAudio}>Enable reply audio</button>}
  </div>;
}
