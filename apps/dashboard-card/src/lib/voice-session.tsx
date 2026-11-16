/** A single card UI, with separate providers for RTC and Companion transports. */
import { createContext, useContext, type ReactNode, useEffect } from 'react';
import * as SDK from '@livekit/components-react';
import { useNativeSession } from './native-session';
import type { SessionClient } from './native-session-client';
import type { ReplyPlayer } from './native-reply-player';
import type { Room } from 'livekit-client';

type Session = ReturnType<typeof SDK.useSession> & { nativeClient?: SessionClient; player?: ReplyPlayer };
type Value = { session: Session; agent: ReturnType<typeof SDK.useAgent>; chat: Pick<ReturnType<typeof SDK.useChat>, 'send'>; transcriptions: ReturnType<typeof SDK.useTranscriptions> };
const Context = createContext<Value | null>(null);
const useValue = () => { const value = useContext(Context); if (!value) throw new Error('Voice provider missing'); return value; };
export const useSessionContext = () => useValue().session;
export const useAgent = () => useValue().agent;
export const useChat = () => useValue().chat;
export const useTranscriptions = () => useValue().transcriptions;
export const useSession = SDK.useSession;

function RTCAdapter({ children }: { children: ReactNode }) {
  const session = SDK.useSessionContext();
  const agent = SDK.useAgent();
  const chat = SDK.useChat();
  const transcriptions = SDK.useTranscriptions();
  return <Context.Provider value={{ session, agent, chat, transcriptions }}>{children}</Context.Provider>;
}
export function SessionProvider({ session, children }: { session: ReturnType<typeof SDK.useSession>; children: ReactNode }) {
  return <SDK.SessionProvider session={session}><RTCAdapter>{children}</RTCAdapter></SDK.SessionProvider>;
}
export function NativeSessionProvider({ room, children }: { room: Room; children: ReactNode }) {
  const native = useNativeSession(room);
  const value = {
    session: native as unknown as Session,
    agent: { state: native.playing ? 'speaking' : native.agentState, isConnected: native.isConnected } as ReturnType<typeof SDK.useAgent>,
    chat: { send: async (text: string) => native.control('text', text) },
    transcriptions: [],
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
function NativeAudioRenderer({ player, muted }: { player: ReplyPlayer; muted?: boolean }) {
  useEffect(() => { player.muted = Boolean(muted); if (muted) player.stop(); }, [muted, player]);
  return null;
}
export function RoomAudioRenderer({ muted }: { muted?: boolean }) {
  const session = useSessionContext();
  return session.player ? <NativeAudioRenderer player={session.player} muted={muted} /> : <SDK.RoomAudioRenderer muted={muted} />;
}
