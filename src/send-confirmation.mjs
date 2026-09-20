// Observes completion of one user-triggered native send. Never issues a Slack
// request and never retains message text, tokens or headers.
export function createSendConfirmation({now=Date.now}={}) {
 const attempts=new Map(),counts={attempts:0,posts:0,matched:0,confirmed:0};let lastMatch=null;
 return {
  status(){return {...counts,lastMatch};},
  begin(sessionId,value){
   if(!value||!/^[a-z0-9-]{1,80}$/.test(value.id)||!/^\d+\.\d+$/.test(value.threadTs||'0.0')||!/^[TE][A-Z0-9]+$/.test(value.workspaceId)||!/^[CDG][A-Z0-9]+$/.test(value.channelId))return false;
   counts.attempts++;attempts.set(sessionId,{...value,at:now()});return true;
  },
  request(sessionId,meta){
   if(meta?.method==='chat.postMessage')counts.posts++;
   const a=attempts.get(sessionId);
   if(meta?.method==='chat.postMessage')lastMatch={attempt:!!a,workspacePresent:!!meta.workspaceId,channelPresent:!!meta.channelId,workspace:meta.workspaceId===a?.workspaceId,channel:meta.channelId===a?.channelId,thread:(meta.threadTs||null)===(a?.threadTs||null)};
   if(!a||now()-a.at>15000||meta?.method!=='chat.postMessage'||(meta.workspaceId&&meta.workspaceId!==a.workspaceId)||meta.channelId!==a.channelId||(meta.threadTs||null)!==(a.threadTs||null))return null;
   counts.matched++;return {id:a.id,workspaceId:a.workspaceId,workspaceVerified:meta.workspaceId===a.workspaceId,channelId:a.channelId,threadTs:a.threadTs||null};
  },
  complete(sessionId,request,response){
   const a=attempts.get(sessionId);
   const responseTeam=response?.message?.team||response?.team;
   if(!a||request?.id!==a.id||(!request.workspaceVerified&&responseTeam!==a.workspaceId)||(responseTeam&&responseTeam!==a.workspaceId)||now()-a.at>30000||response?.ok!==true||response.channel!==a.channelId||!/^\d+\.\d+$/.test(response.ts)||
      (response.message?.thread_ts||null)!==(a.threadTs||null))return null;
   attempts.delete(sessionId);counts.confirmed++;return {id:a.id,ts:response.ts};
  },
  clear(sessionId){attempts.delete(sessionId);},
  dispose(){attempts.clear();}
 };
}
