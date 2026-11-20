import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Conversation } from '../../src/components/Conversation';
import { ConversationHeader } from '../../src/components/ConversationHeader';
import { Dock } from '../../src/components/Dock';
import { LiveCall } from '../../src/components/LiveCall';
import { RecoveryNotice } from '../../src/components/RecoveryNotice';
import { loadCardFont } from '../../src/font';
import { CARD_STYLES } from '../../src/styles';

// Real presentation components with local state only; no session or microphone.
const fixture = window as any;
const host = document.createElement('div');
host.setAttribute('data-fullpage', '');
host.style.cssText = 'display:block;height:calc(100dvh - 118px)';
document.body.append(host);
const shadow = host.attachShadow({ mode: 'open' });
shadow.innerHTML = '<style>' + CARD_STYLES + '</style><div class="lk-root"></div>';
const noop = () => {};
const items = [{ kind: 'message' as const, id: 'reply', role: 'agent' as const,
  text: 'Your lighting preference has been saved. You can continue this conversation in voice or text.', ts: 1 }];

function Fixture() {
  const [draft, setDraft] = useState('');
  const [transcript, setTranscript] = useState(true);
  const [recovery, setRecovery] = useState(false);
  const message = 'Your conversation is still here. Retry the connection or type a message.';
  Object.assign(fixture, { showRecovery: setRecovery });
  const feedback = recovery
    ? { phase: 'error' as const, label: 'Voice needs attention', detail: message }
    : { phase: 'idle' as const, label: 'Ready to talk', detail: 'Start the microphone when you’re ready.' };
  return <ha-card data-live-ui="1" data-dock="auto" data-tall="1">
    <ConversationHeader title="Backend Butler" stateLabel="Live conversation" connected={false} orbState="idle"
      onHistory={noop} onSettings={noop} onUpcoming={noop} upcomingCount={0} />
    <div className="lk-panel">
      <LiveCall transcript={transcript} onTranscript={setTranscript} feedback={feedback}
        getInputLevel={() => 0} getOutputLevel={() => 0} items={items}
        connected={false} connecting={false} micStarting={false} mode="auto" turnActive={false} autoPaused audioEnabled={false}
        onTalk={noop} onSendRecording={noop} onCancelRecording={noop} onPause={noop} onResume={noop}
        onAudio={noop} onInterrupt={noop} onEnd={noop} approvals={null} hasRecovery={recovery}
        notice={recovery && <RecoveryNotice title="Voice session couldn’t connect" message={message}
          retryLabel="Retry voice" onRetry={() => setRecovery(false)} onSettings={noop} />}
        transcriptContent={<>
          <Conversation items={items} voice compact />
          <Dock textOnly connected={false} connecting={false} draft={draft} onDraftChange={setDraft}
            mode="auto" turnActive={false} autoPaused micStarting={false}
            onSend={() => { fixture.sent = draft; return true; }}
            onTurnStart={noop} onTurnEnd={noop} onTurnCancel={noop} onPause={noop} onResume={noop} />
        </>} />
    </div>
  </ha-card>;
}

void loadCardFont().then(() => createRoot(shadow.querySelector('.lk-root')!).render(<Fixture />));
