export const VOICE_WIDGET_STYLES = `
  ha-card.lk-voice-widget {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    min-block-size: 100px;
    max-height: none;
    padding: 16px;
    border-radius: 24px;
    border: 1px solid var(--lk-line);
    background: var(--lk-surface);
    box-shadow: none;
  }
  .lk-widget-identity {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .lk-widget-mark {
    display: grid;
    place-items: center;
    flex: 0 0 48px;
    height: 48px;
    border-radius: 14px;
    background: #202126;
  }
  .lk-widget-mark svg { width: 30px; height: 30px; }
  .lk-widget-copy { min-width: 0; overflow-wrap: anywhere; }
  .lk-widget-copy h2 {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 800;
    line-height: 1.22;
    letter-spacing: -0.025em;
  }
  .lk-widget-status {
    margin: 3px 0 0;
    color: var(--lk-muted);
    font-size: .8125rem;
    font-weight: 600;
    line-height: 1.26;
  }
  .lk-widget-call {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-block-size: 48px;
    max-inline-size: 100%;
    padding: 8px 13px;
    border: 0;
    border-radius: 999px;
    background: var(--lk-accent);
    color: var(--lk-on-accent);
    font-size: .875rem;
    font-weight: 800;
    line-height: 1.2;
    cursor: pointer;
    touch-action: manipulation;
  }
  .lk-widget-call svg {
    flex: none;
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .lk-voice-widget[data-active="true"] .lk-widget-call {
    background: var(--lk-danger);
    color: var(--lk-on-danger);
  }
  .lk-widget-call:active { transform: scale(.98); }
  .lk-widget-call:disabled { opacity: .64; cursor: default; }
  .lk-widget-playback {
    grid-column: 1 / -1;
    border-top: 1px solid var(--lk-line);
    padding-top: 4px;
  }
  .lk-widget-playback button {
    padding: 4px;
    border: 0;
    background: transparent;
    color: var(--lk-accent-ink);
    font-size: .875rem;
    font-weight: 700;
    cursor: pointer;
  }
  .lk-widget-playback p { margin: 0; color: var(--lk-muted); font-size: .875rem; }
  @media (hover: hover) { .lk-widget-call:hover { filter: saturate(.85); } }
  @media (prefers-reduced-motion: reduce) { .lk-widget-call:active { transform: none; } }
  @container (max-width: 310px) {
    ha-card.lk-voice-widget { grid-template-columns: minmax(0, 1fr); }
    .lk-widget-call { justify-self: stretch; }
  }
`;
