/** Existing Butler UI backed by a real, tool-free LiveKit AgentSession over HA auth. */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ConnectionState, ParticipantKind, RoomEvent } from 'livekit-client';
import { ReplyPlayer } from './reply-player';

const Context = createContext<any>(null);
const transcriptions: any[] = [];
const hass = () => (window as any).__nativePocHass;
export const SessionProvider = ({ session, children }: any) => <Context.Provider value={session}>{children}</Context.Provider>;
export const useSessionContext = () => useContext(Context);
export const useAgent = () => { const session = useSessionContext(); return { state: session.playing ? 'speaking' : session.agentState, isConnected: session.isConnected }; };
export const useTranscriptions = () => transcriptions;
export function RoomAudioRenderer({ muted }: { muted?: boolean }) {
  const session = useSessionContext();
  useEffect(() => { session.player.muted = Boolean(muted); if (muted) session.player.stop(); }, [muted, session.player]);
  return null;
}
export const useChat = () => { const session = useSessionContext(); return { send: async (text: string) => session.control('text', text) }; };

export function useSession(_source: any, { room }: any) {
  const [connected, setConnected] = useState(false);
  const [agentState, setAgentState] = useState('disconnected');
  const [playing, setPlaying] = useState(false);
  const methods = useMemo(() => {
    const player = new ReplyPlayer();
    player.onPlaying = setPlaying;
    let unsubscribe: (() => void) | undefined;
    let items: any[] = [];
    let listening = false;
    let audioOutput = true;
    let disposed = false;
    const data = (topic: string, message: any) => room.emit(RoomEvent.DataReceived, new TextEncoder().encode(JSON.stringify(message)), undefined, undefined, topic);
    const seed = () => ({ id: 'isolated-native-speech', items });
    const state = () => data('ha.speech_state', { stt_enabled: listening, audio_output: audioOutput });
    const control = (command: string, payload = '') => hass().callWS({ type: 'butler_native_audio_poc/control', command, payload });
    const fail = (message: string) => data('ha.conversation_error', { message });
    player.onFailure = () => room.emit(RoomEvent.AudioPlaybackStatusChanged, false);
    Object.defineProperty(room, 'canPlaybackAudio', { configurable: true, get: () => !player.blocked && player.context?.state === 'running' });
    room.startAudio = async () => { await player.unlock(); room.emit(RoomEvent.AudioPlaybackStatusChanged, true); };
    room.localParticipant.performRpc = async ({ method, payload = '' }: any) => {
      if (method === 'get_conversation') return JSON.stringify(seed());
      if (method === 'start_turn') { player.stop(); player.muted = false; listening = true; }
      if (method === 'end_turn') void room.startAudio().catch(() => room.emit(RoomEvent.AudioPlaybackStatusChanged, false));
      if (method === 'end_turn' || method === 'cancel_turn') {
        listening = false;
        await hass().callWS({ type: 'butler_native_audio_poc/stop' });
      }
      if (method === 'set_audio_output') {
        audioOutput = payload === 'on'; player.muted = !audioOutput;
        if (!audioOutput) player.stop();
      }
      state();
      try { await control(method, payload); }
      catch (error) { fail('The isolated speech turn failed. Please retry.'); throw error; }
      return 'ok';
    };
    return {
      room, player, control,
      start: async () => {
        disposed = false;
        // Called in the microphone/send tap, before network awaits, for iOS playback permission.
        void room.startAudio().catch(() => room.emit(RoomEvent.AudioPlaybackStatusChanged, false));
        unsubscribe = await hass().connection.subscribeMessage((event: any) => {
          if (disposed) return;
          if (event.type === 'conversation') { items = event.items; data('ha.conversation', seed()); }
          if (event.type === 'state') setAgentState(event.state);
          if (event.type === 'audio') player.push(event);
          if (event.type === 'audio_clear') player.stop();
          if (event.type === 'error') fail(event.message);
        }, { type: 'butler_native_audio_poc/events' });
        try {
          const result = await control('connect');
          if (disposed) { await control('disconnect'); unsubscribe?.(); return; }
          items = result.items;
          room.state = ConnectionState.Connected;
          room.remoteParticipants.set('native-speech', { identity: 'native-speech', kind: ParticipantKind.AGENT, isAgent: true, audioTrackPublications: new Map() });
          setConnected(true);
          room.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Connected);
          data('ha.conversation', seed()); state();
        } catch (error) { unsubscribe?.(); unsubscribe = undefined; throw error; }
      },
      end: async () => {
        disposed = true; listening = false;
        player.stop(); unsubscribe?.(); unsubscribe = undefined;
        await control('disconnect').catch(() => {});
        await player.close();
        room.state = ConnectionState.Disconnected;
        setConnected(false); setAgentState('disconnected');
        room.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Disconnected);
      },
    };
  }, [room]);
  useEffect(() => () => { void methods.end(); }, [methods]);
  return { ...methods, isConnected: connected, agentState, playing };
}
