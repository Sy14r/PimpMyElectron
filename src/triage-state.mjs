import fs from 'node:fs/promises';
import path from 'node:path';
import {compareTs} from './activity-store.mjs';
import {DEFAULT_ACCENT,validAccent} from './accent-theme.mjs';
export const validKey=k=>typeof k==='string'&&/^[TE][A-Z0-9]+:[CDG][A-Z0-9]+:(?:\d+\.\d+)?$/.test(k);
export const validThreadKey=k=>validKey(k)&&/:[0-9]+\.[0-9]+$/.test(k);
const validAlias=value=>typeof value==='string'&&value.length<=120&&!/[\u0000-\u001f\u007f]/.test(value);
const defaults={edge:'right',rest:'strip',display:'main',inboxDensity:'expanded',accentColor:DEFAULT_ACCENT,inboxGlass:false,idleSeconds:60,shortcut:'cmd-shift-y',stockShortcut:'cmd-shift-u',expandOnActivity:true,reopenNew:true,workspace:null,notificationMode:'all',notificationWorkspaces:[]};
export class TriageState {
  records=new Map();aliases=new Map();settings={...defaults};undo=null;error=null;tail=Promise.resolve();
  constructor(file,{now=Date.now}={}){this.file=file;this.now=now;}
  async load(){
    try{const raw=JSON.parse(await fs.readFile(this.file,'utf8'));if(raw.version!==1)throw Error('Unsupported state version');
      for(const [key,r] of Object.entries(raw.records||{}).slice(-5000))if(validKey(key)&&r&&['active','done','later'].includes(r.state))
        this.records.set(key,{state:r.state,pinned:r.pinned===true,until:Number.isFinite(r.until)?r.until:null,baseline:typeof r.baseline==='string'&&/^\d+\.\d+$/.test(r.baseline)?r.baseline:null,at:Number.isFinite(r.at)?r.at:0});
      for(const [key,value] of Object.entries(raw.aliases||{}).slice(-5000))if(validThreadKey(key)&&validAlias(value)&&value.trim())this.aliases.set(key,value.trim());
      this.settings=this.validateSettings(raw.settings||{});
    }catch(e){if(e.code!=='ENOENT')this.error='Local state could not be read; the existing file has been preserved.';}return this;
  }
  validateSettings(patch){const next={...defaults,...this.settings,
    ...(['left','right'].includes(patch.edge)?{edge:patch.edge}:{}),
    ...(['expanded','cozy','compact'].includes(patch.inboxDensity)?{inboxDensity:patch.inboxDensity}:{}),
    ...(validAccent(patch.accentColor)?{accentColor:patch.accentColor.toLowerCase()}:{}),
    ...(typeof patch.inboxGlass==='boolean'?{inboxGlass:patch.inboxGlass}:{}),
    ...(['strip','cluster','hidden'].includes(patch.rest)?{rest:patch.rest}:{}),
    ...(typeof patch.display==='string'&&/^(main|\d+)$/.test(patch.display)?{display:patch.display}:{}),
    ...([0,5,15,30,60,300].includes(patch.idleSeconds)?{idleSeconds:patch.idleSeconds}:{}),
    ...(['cmd-shift-y','cmd-shift-u','ctrl-option-space','option-space'].includes(patch.shortcut)?{shortcut:patch.shortcut}:{}),
    ...(['cmd-shift-y','cmd-shift-u','ctrl-option-space','option-space'].includes(patch.stockShortcut)?{stockShortcut:patch.stockShortcut}:{}),
    ...(typeof patch.expandOnActivity==='boolean'?{expandOnActivity:patch.expandOnActivity}:{}),
    ...(['all','selected','inbox'].includes(patch.notificationMode)?{notificationMode:patch.notificationMode}:{}),
    ...(Array.isArray(patch.notificationWorkspaces)&&patch.notificationWorkspaces.length<=12&&patch.notificationWorkspaces.every(id=>typeof id==='string'&&/^[TE][A-Z0-9]+$/.test(id))?{notificationWorkspaces:[...new Set(patch.notificationWorkspaces)]}:{}),
    ...((patch.workspace==='*'||typeof patch.workspace==='string'&&/^[TE][A-Z0-9]+$/.test(patch.workspace))?{workspace:patch.workspace}:{}),
    ...(typeof patch.reopenNew==='boolean'?{reopenNew:patch.reopenNew}:{})};
    if(next.shortcut===next.stockShortcut){next.shortcut=this.settings.shortcut;next.stockShortcut=this.settings.stockShortcut;}
    return next;}

  project(item){
    const r=this.records.get(item.key);let state=r?.state||'active';
    if(state==='later'&&r.until<=this.now())state='active';
    if(state==='done'&&this.settings.reopenNew&&r.baseline&&item.latest&&compareTs(item.latest,r.baseline)>0)state='active';
    return {alias:this.aliases.get(item.key)||null,state,pinned:r?.pinned||false,until:state==='later'?r.until:null,
      needsAction:state==='active'&&(item.unread===true||r?.pinned===true||!!r),explicit:!!r};
  }
  async save(){
    if(this.error)throw Error(this.error);
    await fs.mkdir(path.dirname(this.file),{recursive:true,mode:0o700});
    const temp=this.file+'.tmp';await fs.writeFile(temp,JSON.stringify({version:1,settings:this.settings,records:Object.fromEntries(this.records),aliases:Object.fromEntries(this.aliases)},null,2)+'\n',{mode:0o600});
    await fs.rename(temp,this.file);
  }
  transact(operation){const promise=this.tail.catch(()=>{}).then(async()=>{
    const old={aliases:new Map(this.aliases),records:new Map(this.records),settings:{...this.settings},undo:this.undo};
    try{operation();await this.save();return true;}catch(e){Object.assign(this,old);throw e;}
  });this.tail=promise;return promise;}
  setAlias(key,value){
    if(!validThreadKey(key)||!validAlias(value))return Promise.resolve(false);
    return this.transact(()=>{
      this.aliases.delete(key);if(value.trim())this.aliases.set(key,value.trim());
      while(this.aliases.size>5000)this.aliases.delete(this.aliases.keys().next().value);
    });
  }
  configure(patch){return this.transact(()=>{this.settings=this.validateSettings(patch);});}
  act(item,action,{minutes=60}={}){if(!item||!validKey(item.key)||!['done','later','pin','reopen','undo'].includes(action)||action==='later'&&![15,60,240,1440].includes(minutes))return Promise.resolve(false);
    return this.transact(()=>{
      if(action==='undo'){if(this.undo&&this.now()-this.undo.at<30000){const u=this.undo;u.previous?this.records.set(u.key,u.previous):this.records.delete(u.key);this.undo=null;}return;}
      const previous=this.records.get(item.key),base=previous||{state:'active',pinned:false,until:null,baseline:null};
      this.undo={key:item.key,previous,at:this.now()};
      const timestamp=(this.now()/1000).toFixed(6),baseline=item.latest&&compareTs(item.latest,timestamp)>0?item.latest:timestamp;
      const next={...base,at:this.now()};
      if(action==='done')Object.assign(next,{state:'done',baseline,until:null});
      if(action==='later')Object.assign(next,{state:'later',until:this.now()+minutes*60000,baseline});
      if(action==='reopen')Object.assign(next,{state:'active',until:null});
      if(action==='pin')next.pinned=!next.pinned;
      this.records.delete(item.key);this.records.set(item.key,next);
      while(this.records.size>5000)this.records.delete(this.records.keys().next().value);
    });
  }
}
