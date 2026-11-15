import React from 'react';
import {createRoot} from 'react-dom/client';
import {HassStore} from '../../src/hass/store';
import {CARD_STYLES} from '../../src/styles';
const fixture=window as any;
fixture.captureRequests=0;fixture.captureInTap=[];fixture.typedMessages=[];fixture.streams=[];
fixture.failure=new URLSearchParams(location.search).get('error')||'NotReadableError';
let insideTap=false;
document.addEventListener('click',()=>{insideTap=true;setTimeout(()=>{insideTap=false},0)},true);
const capture=async()=>{
 fixture.captureRequests++;fixture.captureInTap.push(insideTap);
 if(!insideTap)throw new DOMException('Capture must start in the initiating tap','NotAllowedError');
 if(fixture.failure)throw new DOMException('Synthetic capture failure',fixture.failure);
 if(fixture.captureDelay)await new Promise(r=>setTimeout(r,fixture.captureDelay));
 const ctx=new AudioContext();const destination=ctx.createMediaStreamDestination();
 fixture.streams.push(destination.stream);return destination.stream;
};
// Pin the MediaDevices object: the fixture must never fall through to native capture.
const devices=navigator.mediaDevices;
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:devices});
Object.defineProperty(Object.getPrototypeOf(devices),'getUserMedia',{configurable:true,writable:true,value:capture});
Object.defineProperty(devices,'getUserMedia',{configurable:true,writable:true,value:capture});
fixture.captureInstalled=navigator.mediaDevices.getUserMedia===capture;
const host=document.createElement('div');document.body.append(host);host.style.cssText='display:block;--primary-color:#FC6B02;--primary-text-color:#eee;--secondary-text-color:#aaa;--card-background-color:#181818';
const shadow=host.attachShadow({mode:'open'});shadow.innerHTML='<style>'+CARD_STYLES+'</style><div class="lk-root"></div>';
const store=new HassStore();store.setHost(host);store.setConfig({type:'backend-butler-card',auto_connect:new URLSearchParams(location.search).get('connect')==='auto',input_mode:new URLSearchParams(location.search).get('mode')==='auto'?'auto':'push_to_talk',layout:new URLSearchParams(location.search).get('layout')==='voice'?'voice':'fullpage'});
fixture.currentConversation=()=>store.voiceConversationId;
store.setHass({states:{},user:{id:'synthetic-alice',is_admin:true},callWS:async()=>[],callService:async()=>{},callApi:async(_m:string,path:string)=>path.includes('tasks')?[]:path.includes('history')?{items:[],busy:false}:path.includes('conversations')?{conversations:[]}:path.includes('approvals')?{items:[]}:{users:[],servers:[]}} as any);
// Install synthetic capture before the SDK's WebKit adapter caches getUserMedia.
void import('../../src/App').then(({Root}) => {
 const root=createRoot(shadow.querySelector('.lk-root')!);fixture.unmount=()=>root.unmount();
 root.render(<Root store={store}/>);
});
