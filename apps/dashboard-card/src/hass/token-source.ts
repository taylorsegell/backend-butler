import { TokenSourceConfigurable, type TokenSourceFetchOptions, type TokenSourceResponseObject } from 'livekit-client';
import { loadTurnMode } from '../lib/turn-mode';
import type { HassStore } from './store';

/**
 * Mints a LiveKit token by calling the integration's authenticated endpoint via
 * `hass.callApi` (which attaches the logged-in user's HA auth). The integration builds
 * the room config + agent dispatch server-side, so the client only forwards the desired
 * input mode. Mirrors the frontend's EndpointTokenSource, but auth is HA's.
 */
export class HassTokenSource extends TokenSourceConfigurable {
  private widgetRequest?: AbortSignal;
  private preparation?: {
    waiting: Promise<TokenSourceResponseObject>;
    resolve: (credentials: TokenSourceResponseObject) => void;
  };

  constructor(private readonly store: HassStore) {
    super();
  }

  requestWidgetConnection(signal: AbortSignal): void {
    this.widgetRequest = signal;
  }

  async fetch(_options?: TokenSourceFetchOptions, force = false): Promise<TokenSourceResponseObject> {
    const { hass, config } = this.store.getSnapshot();
    const widget = force ? undefined : this.widgetRequest;
    if (!widget && config.layout === 'voice') {
      // LiveKit prewarms on mount and requests fresh credentials on disconnect. Let
      // those requests share the next explicit call's credentials instead of minting
      // a token and warming the network while the widget is idle.
      if (!this.preparation) {
        let resolve: (credentials: TokenSourceResponseObject) => void;
        const waiting = new Promise<TokenSourceResponseObject>(finish => { resolve = finish; });
        this.preparation = { waiting, resolve };
      }
      return this.preparation.waiting;
    }
    this.widgetRequest = undefined;
    if (widget?.aborted) throw new DOMException('Call startup was cancelled', 'AbortError');
    if (!hass) throw new Error('Home Assistant not ready');
    // The dashboard widget always uses hands-free turn detection. The workspace keeps
    // its own preference. Both assert the mode over RPC once connected.
    const inputMode = widget || loadTurnMode(config) === 'auto' ? 'auto' : 'push_to_talk';
    const request = hass.callApi<TokenSourceResponseObject>('POST', 'backend_butler/token', {
      input_mode: inputMode,
      ...(this.store.voiceConversationId ? { conversation_id: this.store.voiceConversationId } : {}),
    });
    const credentials = widget ? await new Promise<TokenSourceResponseObject>((resolve, reject) => {
      const abort = () => reject(new DOMException('Call startup was cancelled', 'AbortError'));
      widget.addEventListener('abort', abort, { once: true });
      void request.then(resolve, reject).then(() => widget.removeEventListener('abort', abort));
    }) : await request;
    if (widget?.aborted) throw new DOMException('Call startup was cancelled', 'AbortError');
    this.preparation?.resolve(credentials);
    this.preparation = undefined;
    return credentials;
  }
}
