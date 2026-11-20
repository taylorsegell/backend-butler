/** Existing Butler UI backed by a real LiveKit AgentSession over HA auth. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionState, ParticipantKind, RoomEvent } from 'livekit-client';
import { useHass, useStore } from '../hass/context';
import { SessionClient } from './native-session-client';
import { ReplyPlayer } from './native-reply-player';

export function useNativeSession(room: any) {
  const store = useStore();
  const currentHass = useHass() as ReturnType<typeof useHass> & { connection: { subscribeMessage(callback: (event: any) => void, message: any): Promise<() => void> } };
  const hassRef = useRef(currentHass);
  hassRef.current = currentHass;
  const hass = () => hassRef.current!;
  const [, setConnected] = useState(false);
  const [agentState, setAgentState] = useState('disconnected');
  const [playing, setPlaying] = useState(false);
  const methods = useMemo(() => {
    const nativeClient = new SessionClient(message => hass().callWS!(message), () => store.voiceConversationId);
    const player = new ReplyPlayer();
    player.onPlaying = setPlaying;
    let unsubscribe: (() => void) | undefined;
    const unsubscribeEvents = async () => {
      const current = unsubscribe;
      unsubscribe = undefined;
      try { await current?.(); } catch { /* Server expiry may already remove it. */ }
    };
    let items: any[] = [];
    let sessionId = '';
    let conversationId = '';
    let listening = false;
    let audioOutput = true;
    let disposed = true;
    let generation = 0;
    let starting: Promise<void> | undefined;
    let ending: Promise<void> | undefined;
    const current = (operation: number) => !disposed && generation === operation;
    const data = (topic: string, message: any) => room.emit(RoomEvent.DataReceived, new TextEncoder().encode(JSON.stringify(message)), undefined, undefined, topic);
    const seed = () => ({ id: conversationId || sessionId, items });
    const state = () => data('ha.speech_state', { stt_enabled: listening, audio_output: audioOutput });
    const control = (command: string, payload = '') => nativeClient.call({ type: 'backend_butler/native/control', command, payload });
    const fail = (message: string, operation: number) => { if (current(operation)) data('ha.conversation_error', { message }); };
    player.onFinished = segment => {
      const operation = generation;
      if (current(operation)) void control('playback_finished', String(segment)).catch(() => fail('Reply playback could not be confirmed. Reconnect to continue.', operation));
    };
    player.onFailure = () => { if (!disposed) room.emit(RoomEvent.AudioPlaybackStatusChanged, false); };
    Object.defineProperty(room, 'canPlaybackAudio', { configurable: true, get: () => !player.blocked && player.context?.state === 'running' });
    room.startAudio = async () => {
      const operation = generation;
      await player.unlock();
      if (current(operation)) room.emit(RoomEvent.AudioPlaybackStatusChanged, true);
    };
    room.localParticipant.performRpc = async ({ method, payload = '' }: any) => {
      if (method === 'get_conversation') return JSON.stringify(seed());
      const operation = generation;
      if (!current(operation)) return 'ok';
      try {
        if (method === 'start_turn') { player.stop(); player.muted = false; listening = true; }
        if (method === 'end_turn') void room.startAudio().catch(() => { if (current(operation)) room.emit(RoomEvent.AudioPlaybackStatusChanged, false); });
        if (method === 'end_turn' || method === 'cancel_turn') {
          listening = false;
          await nativeClient.call({ type: 'backend_butler/native/stop' });
          if (!current(operation)) return 'ok';
        }
        if (method === 'set_audio_output') {
          audioOutput = payload === 'on'; player.muted = !audioOutput;
          if (!audioOutput) player.stop();
        }
        state();
        await control(method, payload);
      } catch (error) {
        // A closing session rejects in-flight controls normally. Only the session
        // that started this request can report its failure to the active UI.
        if (!current(operation)) return 'ok';
        fail('The speech turn failed. Please retry.', operation);
        throw error;
      }
      return 'ok';
    };
    const end = () => {
      if (ending) return ending;
      disposed = true; generation++; listening = false;
      player.stop();
      room.state = ConnectionState.Disconnected;
      room.remoteParticipants.delete('native-speech');
      setConnected(false); setAgentState('disconnected');
      room.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Disconnected);
      const pendingStart = starting;
      ending = (async () => {
        // Startup may still own a subscription/open request. Let it observe the
        // invalidated generation before closing that same server session once.
        await pendingStart?.catch(() => {});
        await unsubscribeEvents();
        try { await control('disconnect'); }
        finally { await player.close(); }
      })();
      return ending;
    };
    return {
      room, player, control, nativeClient,
      start: () => {
        if (starting) return starting;
        const previousEnd = ending;
        ending = undefined;
        disposed = false;
        const operation = ++generation;
        // Resume audio synchronously in the initiating tap, before any network or
        // cleanup await, so Companion/WebKit keeps the user activation.
        void room.startAudio().catch(() => { if (current(operation)) room.emit(RoomEvent.AudioPlaybackStatusChanged, false); });
        const attempt = (async () => {
          // A new explicit attempt can retry after a reported close failure;
          // it must not overlap cleanup from the previous session.
          await previousEnd?.catch(() => {});
          if (!current(operation)) return;
          try {
            const message = await nativeClient.message({ type: 'backend_butler/native/events' });
            if (!current(operation)) return;
            const remove = await hass().connection.subscribeMessage((event: any) => {
              if (!current(operation)) return;
              if (event.type === 'conversation') { conversationId = event.conversation_id || conversationId; items = event.items; data('ha.conversation', seed()); }
              if (event.type === 'idle') data('ha.session_idle', { reason: 'idle_timeout' });
              if (event.type === 'state') setAgentState(event.state);
              if (event.type === 'audio') player.push(event);
              if (event.type === 'audio_end') player.finish(event.segment);
              if (event.type === 'audio_clear') player.stop();
              if (event.type === 'error') fail(event.message, operation);
            }, message);
            if (!current(operation)) { await remove(); return; }
            unsubscribe = remove;
            const result = await control('connect');
            if (!current(operation)) return;
            items = result.items;
            sessionId = result.session_id;
            conversationId = result.conversation_id || sessionId;
            room.state = ConnectionState.Connected;
            room.remoteParticipants.set('native-speech', { identity: 'native-speech', kind: ParticipantKind.AGENT, isAgent: true, audioTrackPublications: new Map() });
            setConnected(true);
            room.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Connected);
            data('ha.conversation', seed()); state();
          } catch (error) {
            if (!current(operation)) return;
            await unsubscribeEvents();
            await control('disconnect').catch(() => {});
            throw error;
          }
        })();
        starting = attempt;
        void attempt.finally(() => { if (starting === attempt) starting = undefined; }).catch(() => {});
        return attempt;
      },
      end,
    };
  }, [room, store]);
  useEffect(() => () => { void methods.end().catch(error => console.error('Native session cleanup failed', error)); }, [methods]);
  return { ...methods, get isConnected() { return room.state === ConnectionState.Connected; }, agentState, playing };
}
