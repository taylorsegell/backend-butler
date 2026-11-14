/** Isolated lab session adapter: real HA audio receiver, no model/house tools/LiveKit room. */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ConnectionState, ParticipantKind, RoomEvent } from 'livekit-client';
const fixture = window as any;
const Context = createContext<any>(null);
const transcriptions: any[] = [];
let sequence = 0;
const messages: any[] = [{ kind: 'message', id: 'poc-intro', role: 'agent', ts: Date.now(),
 text: 'Native microphone transport proof. Audio is measured locally; speech recognition, model replies and home controls are not connected.' }];
export const SessionProvider = ({ session, children }: any) => <Context.Provider value={session}>{children}</Context.Provider>;
export const useSessionContext = () => useContext(Context);
export const useAgent = () => { const session = useSessionContext(); return { state: session.isConnected ? 'listening' : 'disconnected', isConnected: session.isConnected }; };
export const useTranscriptions = () => transcriptions;
export const RoomAudioRenderer = () => null;
export const useChat = () => ({ send: async () => {} });
export function useSession(_source: any, { room }: any) {
 const [connected, setConnected] = useState(false);
 const methods = useMemo(() => {
  const seed = () => ({ id: 'isolated-native-audio', items: [...messages] });
  const state = (enabled: boolean) => room.emit(RoomEvent.DataReceived, new TextEncoder().encode(JSON.stringify({ stt_enabled: enabled, audio_output: false })), undefined, undefined, 'ha.speech_state');
  room.localParticipant.performRpc = async ({ method }: any) => {
   if (method === 'get_conversation') return JSON.stringify(seed());
   if (method === 'start_turn') state(true);
   if (method === 'end_turn' || method === 'cancel_turn') {
    state(false);
    const stats = await fixture.__nativePocHass.callWS({ type: 'butler_native_audio_poc/stop' });
    if (method === 'end_turn') {
     const text = stats.sdk_frames > 0
      ? `Audio received: ${(stats.samples / 48000).toFixed(2)} seconds, ${stats.sdk_frames} LiveKit PCM frames. No speech recognition was run.`
      : 'No audio frames reached the receiver. Capture is not yet verified.';
     messages.push({ kind: 'message', id: 'proof-' + (++sequence), role: 'agent', ts: Date.now(), text });
     room.emit(RoomEvent.DataReceived, new TextEncoder().encode(JSON.stringify(seed())), undefined, undefined, 'ha.conversation');
    }
   }
   return 'ok';
  };
  return {
   room,
   start: async () => {
    room.state = ConnectionState.Connected;
    room.remoteParticipants.set('native-proof', { identity: 'native-proof', kind: ParticipantKind.AGENT, isAgent: true, audioTrackPublications: new Map() });
    setConnected(true); room.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Connected);
   },
   end: async () => {
    await fixture.__nativePocHass.callWS({ type: 'butler_native_audio_poc/stop' });
    room.state = ConnectionState.Disconnected; setConnected(false); room.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Disconnected);
   },
  };
 }, [room]);
 useEffect(() => () => { void methods.end().catch(console.error); }, [methods]);
 return { ...methods, isConnected: connected };
}
