import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Root } from './App';
import { HassStore } from './hass/store';
import { BUTLER_JACKET_PATHS, BUTLER_LOGO_VIEWBOX, BUTLER_TIE_PATH } from './lib/logo';
import { applyAppearance, subscribeAppearance } from './lib/appearance';
import { syncThemeContrast } from './lib/theme-contrast';
import { CARD_STYLES } from './styles';

// Register the `backend_butler:logo` custom iconset globally when the bundle loads so Home
// Assistant's sidebar renders the complete Butler mark in the current theme color.
// HA's icon API accepts paths, not per-icon colors. Keep the complete mark in currentColor
// so sidebar selection and themes work without changing other icons' global color tokens.
const CUSTOM_ICON = {
  path: [...BUTLER_JACKET_PATHS, BUTLER_TIE_PATH].join(' '),
  viewBox: BUTLER_LOGO_VIEWBOX,
};
const CUSTOM_ICON_MONO = CUSTOM_ICON;

if (typeof window !== 'undefined') {
  const w = window as Window & {
    customIcons?: Record<
      string,
      {
        getIcon: (name: string) => Promise<{ path: string; secondaryPath?: string; viewBox?: string }>;
        getIconList?: () => Promise<{ name: string; keywords?: string[] }[]>;
      }
    >;
    customIconsets?: Record<
      string,
      (name: string) => Promise<{ path: string; secondaryPath?: string; viewBox?: string }>
    >;
  };
  const resolveIcon = async (name: string) => (name === 'logo-mono' ? CUSTOM_ICON_MONO : CUSTOM_ICON);
  w.customIcons = w.customIcons || {};
  w.customIcons.backend_butler = {
    getIcon: resolveIcon,
    getIconList: async () => [
      { name: 'logo', keywords: ['backend', 'butler', 'bowtie', 'voice', 'assistant'] },
      { name: 'logo-mono', keywords: ['backend', 'butler', 'monochrome'] },
    ],
  };
  w.customIconsets = w.customIconsets || {};
  w.customIconsets.backend_butler = resolveIcon;
}

/**
 * The Lovelace custom card. Home Assistant calls `setConfig` once and `set hass` on every
 * state change; both feed the HassStore, which drives the React tree (via useSyncExternalStore)
 * so tiles reflect live state.
 *
 * Persistence across lovelace-view switches: HA *destroys and recreates* the card element when
 * you switch views. To avoid tearing down the live LiveKit session (and losing the whole
 * conversation) on every view switch, the store + React root + mount node live in module scope
 * — a single persistent tree that is simply re-parented into whichever element HA currently has
 * connected. React is never unmounted, so the session and conversation survive; the page
 * unloading (which kills this JS context) is the only real teardown.
 */
let sharedStore: HassStore | null = null;
let sharedMount: HTMLDivElement | null = null;
let sharedRoot: ReactRoot | null = null;

function ensureTree(): { store: HassStore; mount: HTMLDivElement } {
  if (!sharedStore) sharedStore = new HassStore();
  if (!sharedMount) {
    sharedMount = document.createElement('div');
    sharedMount.className = 'lk-root';
  }
  if (!sharedRoot) {
    sharedRoot = createRoot(sharedMount);
    sharedRoot.render(<Root store={sharedStore} />);
  }
  return { store: sharedStore, mount: sharedMount };
}

class BackendButlerCard extends HTMLElement {
  private fullpage = true;
  private viewportObserver?: ResizeObserver;
  private themeObserver?: MutationObserver;
  private scrollTargets: Element[] = [];
  private frame = 0;
  private appearanceUnsubscribe?: () => void;
  private layoutHeight = 0;

  private clearKeyboardViewport = () => {
    this.removeAttribute('data-keyboard');
    this.style.removeProperty('--lk-keyboard-top');
    this.style.removeProperty('--lk-keyboard-h');
  };

  private measureViewport = () => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      if (!this.isConnected || !this.fullpage) return;
      const viewport = window.visualViewport;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportTop = viewport?.offsetTop ?? 0;
      const editing = this.shadowRoot?.activeElement?.matches('textarea.lk-input');
      const bounds = this.getBoundingClientRect();
      const top = Math.max(0, bounds.top - viewportTop);
      const height = Math.max(1, Math.floor(viewportHeight - top));
      const keyboard = editing && viewport && Math.abs(viewport.scale - 1) < .01
        && window.innerHeight - viewportHeight > 100;
      if (keyboard) {
        // iOS can pan the visual viewport or scroll HA while focusing a field.
        // Shrinking a host already above that viewport moves its composer out
        // of view. Preserve the host's flow height and anchor only its contents
        // to the visible area, measured from the unshifted host to avoid drift.
        let visibleTop = viewportTop;
        let visibleBottom = viewportTop + viewportHeight;
        for (const ancestor of this.scrollTargets) {
          if (getComputedStyle(ancestor).overflowY === 'visible') continue;
          const clip = ancestor.getBoundingClientRect();
          visibleTop = Math.max(visibleTop, clip.top + ancestor.clientTop);
          visibleBottom = Math.min(visibleBottom, clip.top + ancestor.clientTop + ancestor.clientHeight);
        }
        const contentTop = Math.max(bounds.top, visibleTop);
        this.setAttribute('data-keyboard', '');
        this.style.setProperty('--lk-available-h', `${this.layoutHeight || height}px`);
        this.style.setProperty('--lk-keyboard-top', `${Math.max(0, contentTop - bounds.top)}px`);
        this.style.setProperty('--lk-keyboard-h', `${Math.max(1, Math.floor(visibleBottom - contentTop))}px`);
        return;
      }
      this.clearKeyboardViewport();
      this.layoutHeight = height;
      this.style.setProperty('--lk-available-h', `${height}px`);
    });
  };

  setConfig(config: any): void {
    ensureTree().store.setConfig(config);
    this.fullpage = config.layout === 'fullpage' || (config.layout !== 'card' && config.layout !== 'voice' && !config.height);
    this.toggleAttribute('data-fullpage', this.fullpage);
    if (!this.fullpage) this.clearKeyboardViewport();
    if (config.layout === 'voice' && !config.height) this.style.setProperty('--lk-h', '380px');
    else if (!config?.height) this.style.removeProperty('--lk-h');
    if (config?.height) this.style.setProperty('--lk-h', `${config.height}px`);
    this._attach();
    this.measureViewport();
  }

  getGridOptions(): Record<string, unknown> {
    return { rows: 'auto', columns: 'full' };
  }

  set hass(hass: any) {
    ensureTree().store.setHass(hass);
    this._attach();
  }

  getCardSize(): number {
    return 8;
  }

  connectedCallback(): void {
    this._attach();
    this.appearanceUnsubscribe?.();
    this.appearanceUnsubscribe = subscribeAppearance(() => {
      applyAppearance(this);
      syncThemeContrast(this);
    });
    this.themeObserver?.disconnect();
    this.themeObserver = new MutationObserver(() => syncThemeContrast(this));
    for (const target of this.scrollTargets) target.removeEventListener('scroll', this.measureViewport);
    this.scrollTargets = [];
    // Theme variables can change on any ancestor, including across HA shadow roots.
    let ancestor: Element | null = this;
    while (ancestor) {
      this.themeObserver.observe(ancestor, { attributes: true, attributeFilter: ['style', 'class'] });
      // HA scroll containers can be inside ancestor shadow roots; their scroll
      // events are not composed and never reach a window capture listener.
      if (ancestor !== this) {
        ancestor.addEventListener('scroll', this.measureViewport, { passive: true });
        this.scrollTargets.push(ancestor);
      }
      ancestor = ancestor.parentElement ?? (ancestor.getRootNode() as ShadowRoot).host ?? null;
    }
    this.viewportObserver = new ResizeObserver(this.measureViewport);
    this.viewportObserver.observe(document.documentElement);
    if (this.parentElement) this.viewportObserver.observe(this.parentElement);
    window.addEventListener('resize', this.measureViewport);
    window.addEventListener('scroll', this.measureViewport, { passive: true });
    this.shadowRoot?.addEventListener('focusin', this.measureViewport);
    this.shadowRoot?.addEventListener('focusout', this.measureViewport);
    window.visualViewport?.addEventListener('resize', this.measureViewport);
    window.visualViewport?.addEventListener('scroll', this.measureViewport);
    this.measureViewport();
  }

  disconnectedCallback(): void {
    this.appearanceUnsubscribe?.();
    this.appearanceUnsubscribe = undefined;
    this.viewportObserver?.disconnect();
    this.themeObserver?.disconnect();
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.measureViewport);
    window.removeEventListener('scroll', this.measureViewport);
    for (const target of this.scrollTargets) target.removeEventListener('scroll', this.measureViewport);
    this.scrollTargets = [];
    this.shadowRoot?.removeEventListener('focusin', this.measureViewport);
    this.shadowRoot?.removeEventListener('focusout', this.measureViewport);
    window.visualViewport?.removeEventListener('resize', this.measureViewport);
    window.visualViewport?.removeEventListener('scroll', this.measureViewport);
    this.clearKeyboardViewport();
  }

  // No teardown on disconnect: a view switch detaches the element, but the shared tree lives on
  // and is re-parented into the next connected element (_attach). This preserves the session.

  /** Ensure this element's shadow root holds the styles + the shared, persistent mount node. */
  private _attach(): void {
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    if (!shadow.querySelector('style[data-lk]')) {
      const style = document.createElement('style');
      style.setAttribute('data-lk', '');
      style.textContent = CARD_STYLES;
      shadow.appendChild(style);
    }
    applyAppearance(this);
    syncThemeContrast(this);
    const { store, mount } = ensureTree();
    store.setHost(this);
    if (mount.parentNode !== shadow) {
      shadow.appendChild(mount); // adopt the persistent React tree into this element
    }
  }
}

if (!customElements.get('backend-butler-card')) customElements.define('backend-butler-card', BackendButlerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'backend-butler-card',
  name: 'Backend Butler',
  description: 'Talk to your Home Assistant voice agent and control devices from the dashboard.',
  preview: false,
});

// Compatibility alias for dashboards written before the rebrand (type: custom:livekit-voice-card).
// Remove in ui-cleanup or the release after. Guarded: a leftover old integration folder may define it too.
let warnedAlias = false;
class LivekitVoiceCard extends BackendButlerCard {
  setConfig(config: any): void {
    if (!warnedAlias) {
      warnedAlias = true;
      console.warn('[backend-butler-card] "custom:livekit-voice-card" is deprecated; change the card type to "custom:backend-butler-card".');
    }
    super.setConfig(config);
  }
}
if (!customElements.get('livekit-voice-card')) customElements.define('livekit-voice-card', LivekitVoiceCard);

/** Compact dashboard surface sharing the same authenticated voice session and controls. */
class BackendButlerVoiceCard extends BackendButlerCard {
  setConfig(config: any): void {
    super.setConfig({ ...config, layout: 'voice', audio_output: config.audio_output ?? true });
  }
}
if (!customElements.get('backend-butler-voice-card')) customElements.define('backend-butler-voice-card', BackendButlerVoiceCard);
window.customCards.push({ type: 'backend-butler-voice-card', name: 'Backend Butler Voice',
  description: 'Talk to Butler directly from your dashboard, with live transcription and spoken replies.', preview: false });
