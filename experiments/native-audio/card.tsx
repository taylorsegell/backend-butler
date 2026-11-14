/** Mount the actual Butler Root and styles inside a separate experimental card. */
import React from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Root } from '../../apps/dashboard-card/src/App';
import { HassStore } from '../../apps/dashboard-card/src/hass/store';
import { CARD_STYLES } from '../../apps/dashboard-card/src/styles';
declare const __BUTLER_SPEECH_LAB__: boolean;
class NativeAudioPocCard extends HTMLElement {
 private readonly store = new HassStore();
 private root: ReactRoot | undefined;
 private mount: HTMLDivElement;
 constructor() {
  super();
  const shadow = this.attachShadow({ mode: 'open' });
  const style = document.createElement('style'); style.textContent = CARD_STYLES; shadow.append(style);
  this.mount = document.createElement('div'); this.mount.className = 'lk-root'; shadow.append(this.mount);
  this.store.setHost(this);
 }
 setConfig() { this.store.setConfig({ type: 'backend-butler-card', title: 'Butler · Native audio lab', layout: 'fullpage', experimental_native_microphone: true, audio_output: __BUTLER_SPEECH_LAB__ }); }
 set hass(hass: any) {
  (window as any).__nativePocHass = hass;
  this.store.setHass({ ...hass, auth: hass.auth, states: {}, callWS: hass.callWS.bind(hass),
   callService: async () => { throw new Error('Home controls are disabled in this experiment'); },
   callApi: async (_method: string, path: string) => path.includes('tasks') ? [] : path.includes('history') ? { items: [], busy: false }
    : path.includes('conversations') ? { conversations: [] } : path.includes('approvals') ? { items: [] } : { users: [], servers: [] },
  });
 }
 connectedCallback() { this.style.setProperty('--lk-available-h', 'calc(100dvh - 64px)'); this.root ??= createRoot(this.mount); this.root.render(<Root store={this.store} />); }
 disconnectedCallback() { this.root?.unmount(); this.root = undefined; }
 getCardSize() { return 12; }
}
if (!customElements.get('backend-butler-native-poc')) customElements.define('backend-butler-native-poc', NativeAudioPocCard);
