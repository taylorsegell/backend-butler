import '../../src/card';

// Exercise the real custom element and its visualViewport integration.
const fixture = window as any;
fixture.syntheticApprovals = [];
fixture.approvalDecisions = [];
fixture.captureRequests = 0;
fixture.typedMessages = [];
fixture.streams = [];
fixture.sessionStarts = 0;
fixture.failure = 'NotReadableError';
const capture = async () => { fixture.captureRequests++; throw new Error('This fixture never starts a microphone'); };
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: capture });

const card = document.createElement('backend-butler-card') as any;
fixture.keyboardCard = card;
card.setConfig({ type: 'custom:backend-butler-card', layout: new URLSearchParams(location.search).get('layout') || 'fullpage' });
card.hass = {
  states: {}, user: { id: 'synthetic-user', is_admin: true },
  callWS: async () => [],
  callService: async () => { throw new Error('No household actions allowed'); },
  callApi: async (_method: string, path: string) => {
    if (path.includes('approvals')) return { items: [] };
    if (path.includes('history')) return { items: [], busy: false };
    if (path.includes('conversations')) return { conversations: [] };
    if (path.includes('tasks')) return [];
    return { users: [], servers: [] };
  },
};
if (new URLSearchParams(location.search).has('shadow')) {
  const shell = document.createElement('div');
  document.body.append(shell);
  const ancestor = shell.attachShadow({ mode: 'open' });
  const scroller = document.createElement('div');
  scroller.style.cssText = 'height:calc(100dvh - 118px);overflow:auto';
  const after = document.createElement('div');
  after.style.height = '400px';
  scroller.append(card, after);
  ancestor.append(scroller);
  fixture.shadowScroller = scroller;
} else document.body.append(card);
