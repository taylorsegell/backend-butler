/** Keep a failed operation and its recovery beside the composer that owns the draft. */
export function RecoveryNotice({ title, message, retryLabel, busy = false, onRetry, onSettings, onEnd, diagnostic }: {
  title: string;
  message: string;
  retryLabel: string;
  busy?: boolean;
  onRetry: () => void;
  onSettings?: () => void;
  onEnd?: () => void;
  diagnostic?: string;
}) {
  return (
    <section className="lk-recovery" aria-label="Connection recovery">
      <div role="alert"><h2>{title}</h2><p>{message}</p></div>
      <div className="lk-recovery-actions">
        <button type="button" className="lk-btn lk-btn-accent" onClick={onRetry} disabled={busy}>
          {busy ? 'Trying again…' : retryLabel}
        </button>
        {onEnd && <button type="button" className="lk-btn" onClick={onEnd}>End voice session</button>}
        {onSettings && <button type="button" className="lk-btn" onClick={onSettings}>Connection settings</button>}
      </div>
      {diagnostic && <details><summary>Diagnostic details</summary><p>Microphone capture: {diagnostic}</p></details>}
    </section>
  );
}
