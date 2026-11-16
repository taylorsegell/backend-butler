import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ConnectionState, ParticipantKind, RoomEvent, Track } from 'livekit-client';
const Context = createContext<any>(null);
export const SessionProvider = ({session,children}: any) => <Context.Provider value={session}>{children}</Context.Provider>;
export const useSessionContext = () => useContext(Context);
export const useAgent = () => {
 const s=useSessionContext();const [phase,setPhase]=useState<string>();
 useEffect(()=>{const update=(event:Event)=>setPhase((event as CustomEvent).detail);window.addEventListener('fixture-agent',update);return()=>window.removeEventListener('fixture-agent',update)},[]);
 return {state:s.isConnected?(phase||'listening'):'disconnected',isConnected:s.isConnected};
};
const transcriptions:any[]=[];
export const useTranscriptions=()=>transcriptions;
export const RoomAudioRenderer=()=>null;
export const useChat=()=>({send:async(text:string)=>{(window as any).typedMessages.push(text)}});
export function useSession(_source:any,{room}:any) {
 const [connected,setConnected]=useState(false);
 const methods=useMemo(()=>{
  let publication:any;let sequence=0;
  (window as any).emitIdle=()=>room.emit(RoomEvent.DataReceived,new TextEncoder().encode(JSON.stringify({reason:'idle_timeout'})),undefined,undefined,'ha.session_idle');
  (window as any).emitConversation=(items:any[])=>room.emit(RoomEvent.DataReceived,new TextEncoder().encode(JSON.stringify({id:'synthetic-conversation',items})),undefined,undefined,'ha.conversation');
  const state=(stt=false)=>room.emit(RoomEvent.DataReceived,new TextEncoder().encode(JSON.stringify({stt_enabled:stt,audio_output:false})),undefined,undefined,'ha.speech_state');
  (window as any).emitSpeech=(audio:boolean,playback=true,microphone=false)=>{
   Object.defineProperty(room,'canPlaybackAudio',{configurable:true,get:()=>playback});
   room.emit(RoomEvent.AudioPlaybackStatusChanged,true);
   room.emit(RoomEvent.DataReceived,new TextEncoder().encode(JSON.stringify({stt_enabled:microphone,audio_output:audio})),undefined,undefined,'ha.speech_state');
  };
  room.startAudio=async()=>{Object.defineProperty(room,'canPlaybackAudio',{configurable:true,get:()=>true});room.emit(RoomEvent.AudioPlaybackStatusChanged,true)};
  room.localParticipant.getTrackPublication=()=>publication;
  room.localParticipant.publishTrack=async(track:any)=>{
   publication={track,isMuted:false,source:Track.Source.Microphone};room.localParticipant.audioTrackPublications.set('fixture-'+(++sequence),publication);room.emit(RoomEvent.LocalTrackPublished,publication);return publication;
  };
  room.localParticipant.unpublishTrack=async(track:any)=>{track.stop();for(const [id,p] of room.localParticipant.audioTrackPublications){if(p.track===track)room.localParticipant.audioTrackPublications.delete(id)}publication=undefined;room.emit(RoomEvent.LocalTrackUnpublished);};
  room.localParticipant.performRpc=async({method,payload}:any)=>{
   ((window as any).rpcCalls??=[]).push(method);
   if(method==='get_conversation')return JSON.stringify({id:'synthetic-conversation',items:[{kind:'message',id:'a',role:'agent',text:'A synthetic test conversation.',ts:1}]});
   if(method==='set_turn_mode'){(window as any).serverMode=payload;state(payload==='auto')}
   if(method==='cancel_turn'&&(window as any).hangCancel)return new Promise(()=>{});
   if(method==='start_turn')state(true);
   if(method==='cancel_turn'||method==='end_turn')state(false);
   return 'ok';
  };
  return {
   start:async()=>{
    (window as any).sessionStarts=((window as any).sessionStarts||0)+1;
    (window as any).connectionStarted=true;
    await new Promise(r=>setTimeout(r,Number(new URLSearchParams(location.search).get('delay')||150)));
    room.state=ConnectionState.Connected;
    room.remoteParticipants.set('synthetic-agent',{identity:'synthetic-agent',kind:ParticipantKind.AGENT,isAgent:true,audioTrackPublications:new Map()});
    setConnected(true);room.emit(RoomEvent.ConnectionStateChanged,ConnectionState.Connected);
   },
   end:async()=>{(window as any).sessionEnds=((window as any).sessionEnds||0)+1;room.state=ConnectionState.Disconnected;setConnected(false);room.emit(RoomEvent.ConnectionStateChanged,ConnectionState.Disconnected)},room,
  };
 },[room]);
 return {...methods,isConnected:connected};
}
