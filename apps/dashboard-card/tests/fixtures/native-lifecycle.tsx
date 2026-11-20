/** Real native provider/UI; synthetic authenticated HA and Companion boundaries. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from '../../src/App';
import { HassStore } from '../../src/hass/store';
import { CARD_STYLES } from '../../src/styles';
const fixture = window as any;
const sessionId = '1'.repeat(32);
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let closed = false;
Object.assign(fixture, { audioResumesInTap: [], requests: [], pending: [], stops: 0, opens: 0, endStarted: false, hold: '', disconnectFails: false });
let insideTap = false;
document.addEventListener('click', () => { insideTap = true; setTimeout(() => { insideTap = false; }, 0); }, true);
const resume = AudioContext.prototype.resume;
AudioContext.prototype.resume = function() { fixture.audioContext = this; fixture.audioResumesInTap.push(insideTap); if (fixture.holdAudio) return new Promise((_resolve, reject) => { fixture.rejectAudio = reject; }); return resume.call(this); };
const host = document.createElement('div'); host.setAttribute('data-fullpage', '');
host.style.cssText = 'display:block;height:100dvh;--primary-color:#FC6B02;--primary-text-color:#eee;--secondary-text-color:#aaa;--card-background-color:#181818';
document.body.append(host);
const shadow = host.attachShadow({ mode: 'open' }); shadow.innerHTML = '<style>' + CARD_STYLES + '</style><div class="lk-root"></div>';
const store = new HassStore(); store.setHost(host); store.setConfig({ type: 'backend-butler-card', layout: 'fullpage' });
store.setHass({
  states: {}, user: { id: 'synthetic-user', name: 'Test', is_admin: true },
  auth: { external: { config: { webrtc: { hasCameraMicrophoneStream: true } }, sendMessage: async () => ({ session_id: 'synthetic-microphone' }), fireMessage: () => { fixture.stops++; } } },
  connection: { subscribeMessage: async (callback: any) => { fixture.nativeEvent = callback; return async () => { await delay(80); fixture.nativeEvent = undefined; }; } },
  callWS: async (message: any) => {
    fixture.requests.push({ ...message, afterEnd: fixture.endStarted });
    if (message.type.endsWith('/open')) { fixture.opens++; closed = false; return { session_id: sessionId }; }
    if (message.type.endsWith('/prepare') && fixture.holdPrepare) await new Promise(resolve => { fixture.releasePrepare = resolve; });
    if (message.type.endsWith('/prepare')) return { session_id: sessionId, entity_id: 'camera.backend_butler_native_audio_' + sessionId };
    if (message.command === 'connect' && fixture.holdConnect) await new Promise(resolve => { fixture.releaseConnect = resolve; });
    if (message.command === 'connect') { fixture.nativeEvent?.({ type: 'state', state: 'listening' }); return { session_id: sessionId, conversation_id: 'synthetic-conversation', items: [{ kind: 'message', id: 'reply', role: 'agent', text: 'A completed synthetic reply.', ts: 1 }] }; }
    if (message.command === 'disconnect') { closed = true; if (fixture.holdDisconnect) await new Promise(resolve => { fixture.releaseDisconnect = resolve; }); else await delay(40); fixture.disconnectCompleted = true; if (fixture.disconnectFails) throw Error('Synthetic durable close failed'); return {}; }
    if (fixture.hold && message.command === fixture.hold) return new Promise((resolve, reject) => fixture.pending.push({ command: message.command, resolve, reject }));
    if (fixture.endStarted && message.command === 'set_turn_mode') { await delay(180); if (closed) throw Error('Synthetic session already closed'); }
    return {};
  },
  callService: async () => { throw Error('No household actions allowed'); },
  callApi: async (_verb: string, path: string) => {
    if (path === 'backend_butler/native/config') return { enabled: true };
    if (path.includes('approvals')) return { items: [] };
    if (path.includes('history')) return { items: [], busy: false };
    if (path.includes('conversations')) return { conversations: [] };
    if (path.includes('tasks')) return [];
    return { users: [], servers: [] };
  },
} as any);
fixture.releasePending = (reject = true) => { for (const operation of fixture.pending.splice(0)) reject ? operation.reject(Error('Synthetic late control rejection')) : operation.resolve({}); };
const root = createRoot(shadow.querySelector('.lk-root')!); fixture.unmount = () => root.unmount(); root.render(<Root store={store} />);
