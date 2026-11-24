import type { ReactNode } from 'react';
import { BUTLER_JACKET_PATHS, BUTLER_LOGO_VIEWBOX, BUTLER_TIE_PATH } from '../lib/logo';
import { CallIcon } from './CallIcon';

interface VoiceWidgetProps {
  title: string;
  status: string;
  active: boolean;
  starting: boolean;
  failed: boolean;
  ending: boolean;
  onToggleCall: () => void;
  onEnablePlayback?: () => void;
  playbackError?: string | null;
  children: ReactNode;
}

export function VoiceWidget({ title, status, active, starting, failed, ending, onToggleCall, onEnablePlayback, playbackError, children }: VoiceWidgetProps) {
  const action = starting ? 'Cancel call' : active ? 'End call' : failed ? 'Try again' : 'Start call';

  return (
    <ha-card className="lk-voice-widget" data-active={active}>
      {children}
      <div className="lk-widget-identity">
        <span className="lk-widget-mark" aria-hidden="true">
          <svg viewBox={BUTLER_LOGO_VIEWBOX} focusable="false">
            {BUTLER_JACKET_PATHS.map(path => <path key={path} d={path} fill="#f2f2f3" />)}
            <path d={BUTLER_TIE_PATH} fill="#fc6b02" />
          </svg>
        </span>
        <div className="lk-widget-copy">
          <h2>{title}</h2>
          <p className="lk-widget-status" role="status" aria-atomic="true">{status}</p>
        </div>
      </div>
      <button className="lk-widget-call" type="button" disabled={ending} onClick={onToggleCall}>
        <CallIcon name={active ? 'end' : 'microphone'} />
        {action}
      </button>
      {onEnablePlayback && <div className="lk-widget-playback">
        <button type="button" onClick={onEnablePlayback}>Enable reply audio</button>
        {playbackError && <p role="alert">{playbackError}</p>}
      </div>}
    </ha-card>
  );
}
