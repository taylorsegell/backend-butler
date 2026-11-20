/** Conduit call composition, expressed in Butler's approved dark-surface identity. */
export const LIVE_CALL_STYLES = `
  ha-card[data-live-ui="1"] {
    --lk-fg: #f1f0ee; --lk-muted: #adb0b8; --lk-surface: #0d0f13;
    --lk-elevated: #181b21; --lk-line: #30333b;
    --lk-accent: #fc6b02; --lk-on-accent: #15100b; --lk-accent-ink: #ff9d5a; --lk-focus: #ffa365;
    --lk-danger: #ff827a; --lk-danger-ink: #ff827a; --lk-on-danger: #18100f;
    background: radial-gradient(ellipse at 12% 6%, #34201438, transparent 55%), radial-gradient(ellipse at 94% 82%, #1e304030, transparent 60%), var(--lk-surface);
    color: var(--lk-fg); height: var(--lk-h); min-height: 440px; max-height: none; padding: 0;
    overflow: hidden; font-family: var(--lk-sans);
  }
  :host([data-fullpage]) ha-card[data-live-ui="1"] { height: 100%; min-height: 0; }
  :host([data-keyboard]) { position: relative; }
  :host([data-keyboard]) .lk-root { position: absolute; inset-inline: 0; top: var(--lk-keyboard-top); height: var(--lk-keyboard-h); }
  :host([data-keyboard]) .lk-call-status, :host([data-keyboard]) .lk-call-utility { display: none; }
  :host([data-keyboard]) .lk-call-body { min-height: 0; }
  :host([data-keyboard]) .lk-conversation-header { min-height: 56px; padding-block: 6px; }
  ha-card[data-live-ui="1"] .lk-conversation-header { padding: 12px 16px; min-height: 76px; gap: 8px; justify-content: flex-end; }
  ha-card[data-live-ui="1"] .lk-conversation-identity { flex: 1; justify-content: center; padding-left: 0; position: absolute; left: 92px; right: 92px; min-width: 0; }
  ha-card[data-live-ui="1"] .lk-conversation-dot { display: none; }
  ha-card[data-live-ui="1"] .lk-conversation-heading { text-align: center; min-width: 0; }
  ha-card[data-live-ui="1"] .lk-conversation-title { font-size: 14px; font-weight: 650; display: flex; align-items: center; justify-content: center; gap: 6px; }
  ha-card[data-live-ui="1"] .lk-conversation-status { font-size: 11px; }
  ha-card[data-live-ui="1"] .lk-conversation-upcoming-label { display: none; }
  ha-card[data-live-ui="1"] .lk-conversation-actions { gap: 0; }
  ha-card[data-live-ui="1"] .lk-conversation-action, ha-card[data-live-ui="1"] .lk-conversation-upcoming { width: 44px; padding: 0; }
  ha-card[data-live-ui="1"] .lk-conversation-upcoming { position: absolute; left: 12px; }
  ha-card[data-live-ui="1"] .lk-conversation-count { font-size: 10px; }
  .lk-call-header-mark { width: 18px; height: 18px; flex: none; }
  .lk-conversation-actions button svg { width: 19px; height: 19px; }
  .lk-send svg { width: 22px; height: 22px; }
  .lk-call { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; padding: 8px 24px 16px; }
  .lk-call-body { display: flex; flex: 1; min-height: 100px; min-width: 0; }
  .lk-live-stage { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; }
  .lk-live-stage[hidden], .lk-call-transcript[hidden] { display: none; }
  .lk-call-captions { width: 100%; max-width: 620px; text-align: left; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scroll-behavior: auto; flex: 0 1 auto; min-height: 164px; max-height: 40%; padding: 16px 4px 8px; overflow-wrap: anywhere; }
  .lk-call-captions:focus-visible { outline: 2px solid var(--lk-focus); outline-offset: 2px; }
  .lk-call-user { margin: 0 0 12px; color: var(--lk-muted); font-size: 16px; line-height: 1.5; }
  .lk-call-reply { margin: 0; font-size: 25px; font-weight: 650; letter-spacing: -.025em; line-height: 1.24; text-wrap: pretty; }
  .lk-call-presence { flex: 1; min-height: 130px; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 8px 0 48px; gap: 16px; }
  .lk-brand-glow { position: relative; width: 190px; height: 190px; max-height: 100%; }
  .lk-brand-glow canvas { display: block; width: 100%; height: 100%; }
  .lk-brand-glow svg { position: absolute; inset: 10%; width: 80%; height: 80%; filter: drop-shadow(0 0 14px #e9dfca22); }
  .lk-brand-glow[data-renderer="webgl"] svg { visibility: hidden; }
  .lk-brand-glow[data-renderer="fallback"] canvas { visibility: hidden; }
  .lk-call-status { flex: none; text-align: center; padding: 8px 0 16px; }
  .lk-call-status p:first-child { font-size: 15px; font-weight: 550; margin: 0 0 6px; }
  .lk-call-status p:nth-child(2) { color: var(--lk-muted); font-size: 12px; line-height: 1.5; margin: 0; }
  .lk-call-controls { display: flex; flex: none; justify-content: center; gap: 12px; padding-top: 12px; }
  .lk-call-control { display: flex; flex-direction: column; align-items: center; gap: 8px; background: none; border: 0; padding: 0; font: 11px/1.4 var(--lk-sans); width: 58px; cursor: pointer; }
  .lk-call-control > span:last-child { white-space: nowrap; }
  .lk-call-circle { display: grid; place-items: center; background: #ffffff07; border-radius: 50%; width: 54px; height: 54px; transition: background .15s; }
  .lk-call-circle svg { width: 22px; height: 22px; }
  .lk-call-control[data-primary="1"] .lk-call-circle { background: #fc6b0214; color: #ffbd83; }
  .lk-call-control[data-danger="1"] .lk-call-circle { background: #ed515e; color: #fff; }
  .lk-call-control[aria-pressed="true"] .lk-call-circle { background: #fc6b0226; color: #ffbd83; }
  .lk-call-control:disabled { cursor: default; color: #999ca5; }
  .lk-call-control:disabled .lk-call-circle { opacity: .45; }
  .lk-call-control:not(:disabled):hover .lk-call-circle { background: #ffffff13; }
  .lk-call-control[data-primary="1"]:not(:disabled):hover .lk-call-circle { background: #fc6b0226; }
  .lk-call-control:focus-visible { border-radius: 8px; }
  .lk-call-utility { display: flex; flex: none; justify-content: center; align-items: center; gap: 12px; color: var(--lk-muted); font-size: 11px; min-height: 44px; text-align: center; }
  .lk-call-utility button { font: inherit; border: none; background: none; color: #ffc090; cursor: pointer; min-height: 44px; }
  .lk-call-transcript { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; }
  .lk-call-transcript .lk-convo { padding: 12px 0; }
  .lk-call-transcript .lk-empty--call { flex: 1; width: 100%; margin: 0 auto; padding-block: 0 4px; gap: 8px; }
  .lk-empty--call .lk-starters { margin-top: 0; flex-shrink: 0; }
  .lk-empty-brand { position: relative; flex: 1 1 0; min-height: 0; width: 100%; }
  .lk-empty-brand svg { position: absolute; inset: 0; margin: auto; width: 152px; height: 152px; max-width: 100%; max-height: 100%; filter: drop-shadow(0 0 14px #e9dfca22); }
  .lk-call-transcript :is(.lk-empty p, .lk-starters button), .lk-call-status p, .lk-call-utility span,
  .lk-call-notices .lk-recovery :is(h2, p) { text-wrap: balance; }
  .lk-call-notices { flex: none; max-height: 36%; overflow: auto; }
  .lk-call-notices:has(.lk-recovery) { max-height: 44%; }
  .lk-call-notices:empty { display: none; }
  .lk-call-notices .lk-recovery { margin: 8px 0; padding: 12px; font-size: 13px; }
  .lk-call-notices .lk-recovery h2 { font-size: 16px; }
  .lk-call-notices .lk-recovery p { font-size: 14px; line-height: 1.45; margin: 4px 0 12px; }
  .lk-call-notices .lk-recovery-actions { align-items: center; }
  .lk-call-notices .lk-recovery-actions .lk-btn:not(.lk-btn-accent) { border-color: transparent; background: transparent; color: var(--lk-accent-ink); padding-inline: 8px; }
  .lk-call-notices .lk-approvals { margin: 0; }
  .lk-call-transcript .lk-dock { padding: 8px 0; }
  ha-card[data-live-ui="1"] .lk-call-transcript .lk-input { font-size: 16px; }
  /* A decision or recovery takes reading space on a phone; keep a compact live presence
     instead of squeezing the caption and logo into overlapping flex items. */
  @container (max-width: 899px) {
    .lk-call[data-transcript="0"]:has(.lk-call-notices :is(.lk-approval, .lk-recovery)) .lk-call-body { flex: none; min-height: 0; }
    .lk-call[data-transcript="0"]:has(.lk-call-notices :is(.lk-approval, .lk-recovery)) .lk-call-captions { display: none; }
    .lk-call[data-transcript="0"]:has(.lk-call-notices :is(.lk-approval, .lk-recovery)) .lk-call-presence { flex-direction: row; min-height: 80px; padding: 0; gap: 12px; }
    .lk-call[data-transcript="0"]:has(.lk-call-notices :is(.lk-approval, .lk-recovery)) .lk-brand-glow { width: 72px; height: 72px; flex: none; }
    .lk-call[data-transcript="0"]:has(.lk-call-notices :is(.lk-approval, .lk-recovery)) .lk-call-status { flex: 1; text-align: left; padding-block: 4px; }
    .lk-call[data-transcript="0"]:has(.lk-call-notices :is(.lk-approval, .lk-recovery)) .lk-call-notices { flex: 1; min-height: 0; max-height: none; }
  }
  @container (min-width: 900px) {
    .lk-call { padding-inline: 48px; }
    .lk-call[data-transcript="1"] { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 420px); grid-template-rows: minmax(0, 1fr) auto auto auto auto; column-gap: 32px; }
    .lk-call[data-transcript="1"] .lk-call-body { display: contents; }
    .lk-call[data-transcript="1"] .lk-live-stage { display: flex; grid-column: 1; grid-row: 1; }
    .lk-call[data-transcript="1"] .lk-call-presence { padding-bottom: 8px; }
    .lk-call[data-transcript="1"] > .lk-call-status { grid-column: 1; grid-row: 2; }
    .lk-call[data-transcript="1"] > .lk-call-notices { grid-column: 1; grid-row: 3; max-height: 180px; }
    .lk-call[data-transcript="1"] > .lk-call-controls { grid-column: 1; grid-row: 4; }
    .lk-call[data-transcript="1"] > .lk-call-utility { grid-column: 1; grid-row: 5; }
    .lk-call[data-transcript="1"] .lk-call-transcript { grid-column: 2; grid-row: 1 / -1; padding: 16px; border-radius: 16px; background: #171b21; border: 1px solid var(--lk-line); }
    .lk-empty-brand svg { display: none; }
    .lk-call-reply { font-size: 29px; }
    .lk-call-captions { padding-top: 32px; }
    .lk-brand-glow { width: 210px; height: 210px; }
    .lk-call-control { width: 64px; }
    .lk-call-circle { width: 58px; height: 58px; }
  }
  @container (max-width: 359px) {
    .lk-call { padding-inline: 12px; padding-bottom: 4px; }
    .lk-call-controls { gap: 8px; }
    .lk-call-control { width: 50px; }
    .lk-call-circle { width: 46px; height: 46px; }
    .lk-call-reply { font-size: 21px; }
    .lk-brand-glow { width: 142px; height: 142px; }
    .lk-call-status { padding-bottom: 4px; }
    .lk-call-captions { min-height: 126px; }
    .lk-call-utility { gap: 4px; font-size: 10px; }
  }
  @media (max-height: 700px) {
    .lk-call-presence { min-height: 80px; padding-bottom: 8px; gap: 4px; }
    .lk-call-captions { min-height: 110px; }
    .lk-brand-glow { width: 130px; height: 130px; }
    .lk-call-reply { font-size: 21px; }
    .lk-call-captions { padding-top: 4px; }
    .lk-call-status { padding-block: 4px; }
  }
  @media (prefers-reduced-motion: reduce) { .lk-call-circle { transition: none; } }
`;
