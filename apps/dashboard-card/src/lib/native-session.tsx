/** Existing Butler UI backed by a real LiveKit AgentSession over HA auth. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionState, ParticipantKind, RoomEvent } from 'livekit-client';
import { useHass } from '../hass/context';
import { SessionClient } from './native-session-client';
import { useStore } from '../hass/context';
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
    let disposed = false;
    const data = (topic: string, message: any) => room.emit(RoomEvent.DataReceived, new TextEncoder().encode(JSON.stringify(message)), undefined, undefined, topic);
    const seed = () => ({ id: conversationId || sessionId, items });
    const state = () => data('ha.speech_state', { stt_enabled: listening, audio_output: audioOutput });
    const control = (command: string, payload = '') => nativeClient.call({ type: 'backend_butler/native/control', command, payload });
    const fail = (message: string) => data('ha.conversation_error', { message });
    player.onFinished = segment => {
      if (!disposed) void control('playback_finished', String(segment)).catch(() => fail('Reply playback could not be confirmed. Reconnect to continue.'));
    };
    player.onFailure = () => room.emit(RoomEvent.AudioPlaybackStatusChanged, false);
    Object.defineProperty(room, 'canPlaybackAudio', { configurable: true, get: () => !player.blocked && player.context?.state === 'running' });
    room.startAudio = async () => { await player.unlock(); room.emit(RoomEvent.AudioPlaybackStatusChanged, true); };
    room.localParticipant.performRpc = async ({ method, payload = '' }: any) => {
      if (method === 'get_conversation') return JSON.stringify(seed());
      if (method === 'start_turn') { player.stop(); player.muted = false; listening = true; }
      if (method === 'end_turn') void room.startAudio().catch(() => room.emit(RoomEvent.AudioPlaybackStatusChanged, false));
      if (method === 'end_turn' || method === 'cancel_turn') {
        listening = false;
        await nativeClient.call({ type: 'backend_butler/native/stop' });
      }
      if (method === 'set_audio_output') {
        audioOutput = payload === 'on'; player.muted = !audioOutput;
        if (!audioOutput) player.stop();
      }
      state();
      try { await control(method, payload); }
      catch (error) { fail('The speech turn failed. Please retry.'); throw error; }
      return 'ok';
    };
    return {
      room, player, control, nativeClient,
      start: async () => {
        disposed = false;
        // Called in the microphone/send tap, before network awaits, for iOS playback permission.
        void room.startAudio().catch(() => room.emit(RoomEvent.AudioPlaybackStatusChanged, false));
        unsubscribe = await hass().connection.subscribeMessage((event: any) => {
          if (disposed) return;
          if (event.type === 'conversation') { conversationId = event.conversation_id || conversationId; items = event.items; data('ha.conversation', seed()); }
          if (event.type === 'idle') data('ha.session_idle', { reason: 'idle_timeout' });
          if (event.type === 'state') setAgentState(event.state);
          if (event.type === 'audio') player.push(event);
          if (event.type === 'audio_end') player.finish(event.segment);
          if (event.type === 'audio_clear') player.stop();
          if (event.type === 'error') fail(event.message);
        }, await nativeClient.message({ type: 'backend_butler/native/events' }));
        try {
          const result = await control('connect');
          if (disposed) { await control('disconnect'); await unsubscribeEvents(); return; }
          items = result.items;
          sessionId = result.session_id;
          conversationId = result.conversation_id || sessionId;
          room.state = ConnectionState.Connected;
          room.remoteParticipants.set('native-speech', { identity: 'native-speech', kind: ParticipantKind.AGENT, isAgent: true, audioTrackPublications: new Map() });
          setConnected(true);
          room.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Connected);
          data('ha.conversation', seed()); state();
        } catch (error) {
          await unsubscribeEvents();
          await control('disconnect').catch(() => {});
          throw error;
        }
      },
      end: async () => {
        disposed = true; listening = false;
        player.stop(); await unsubscribeEvents();
        await control('disconnect').catch(() => {});
        await player.close();
        room.state = ConnectionState.Disconnected;
        setConnected(false); setAgentState('disconnected');
        room.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Disconnected);
      },
    };
  }, [room, store]);
  useEffect(() => () => { void methods.end(); }, [methods]);
  return { ...methods, get isConnected() { return room.state === ConnectionState.Connected; }, agentState, playing };
}
