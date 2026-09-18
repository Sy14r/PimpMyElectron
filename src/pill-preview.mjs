// Builds only a bounded, cached preview. No navigation, state mutation or I/O.
import {compareTs} from './activity-store.mjs';
export function pillPreview(workspaces,request){
  const a=request?.anchor;
  if(!a||!['left','right'].includes(request.edge)||!['x','y','width','height'].every(k=>Number.isFinite(a[k]))||
    Math.abs(a.x)>100000||Math.abs(a.y)>100000||a.width<=0||a.width>64||a.height<=0||a.height>64)return null;
  for(const w of workspaces){
    const item=w.items.find(i=>i.key===request.key);
    if(!item||item.unread!==true||['done','later'].includes(item.triage?.state))continue;
    const hasCursor=typeof item.lastRead==='string'&&/^\d+\.\d+$/.test(item.lastRead);
    const fresh=hasCursor?item.messages.filter(m=>compareTs(m.ts,item.lastRead)>0):[];
    const selected=hasCursor?fresh.slice(-3):item.messages.slice(-1);
    const clipped=(value,limit)=>{const s=String(value||'');return s.length>limit?s.slice(0,limit-1)+'…':s;};
    const messages=selected.map(m=>({author:clipped(m.author,160),text:clipped(m.parts?.map(p=>p.text).join('')||m.text||(m.hasAttachments?'Attachment':'Message content unavailable'),600)}));
    const kind={dm:'DM',groupDM:'Group chat',channel:'Channel',thread:'Thread'}[item.kind]||'Conversation';
    return {key:item.key,title:String(item.name).slice(0,180),subtitle:`${w.name} · ${kind}`.slice(0,220),
      label:hasCursor?(fresh.length>3?`Showing latest 3 of ${fresh.length} cached new messages`:fresh.length===1?'New message':'New messages'):'Latest cached message · unread boundary unknown',
      messages:messages.length?messages:[{author:'',text:hasCursor?'New message content is not cached yet.':'No message preview cached yet.'}],
      edge:request.edge,anchor:{x:a.x,y:a.y,width:a.width,height:a.height}};
  }
  return null;
}
