import fs from 'node:fs/promises';
// Native transparency must be chosen before BrowserWindow is constructed.
// Keep a small recovery record before changing that preference. No message or
// account data is read. The record also survives mod reloads within one launch.
export function createWindowBackdrop({cdp,file,launchId,profile='default'}) {
  const pages=new Map();let disposed=false,preparing=Promise.resolve(),lastRequested;
  let state={state:'off',ready:false,restoreVibrancy:null},records={version:1,profiles:{}},loaded=false;
  async function save(){
    const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(records)+'\n',{mode:0o600});await fs.rename(temp,file);
  }
  const read=entry=>cdp.evaluate("window.desktop?.app?.getPreference('windowVibrancy')",entry.sessionId);
  async function preference(entry,value){
    await cdp.evaluate(`desktop.app.setPreference({name:'windowVibrancy',value:${value}})`,entry.sessionId);
    for(let i=0;i<10;i++){if(await read(entry)===value)return;await new Promise(resolve=>setTimeout(resolve,100));}
    throw Error('Native preference was not applied');
  }
  function prepare(entry,enabled){
    if(disposed)return Promise.resolve(state);
    if(lastRequested===enabled)return preparing;
    lastRequested=enabled;
    preparing=preparing.catch(()=>{}).then(async()=>{
      try{
        if(!loaded){
          try{records=JSON.parse(await fs.readFile(file,'utf8'));if(records.version!==1||!records.profiles||typeof records.profiles!=='object')throw Error('Invalid appearance record');}
          catch(e){if(e.code!=='ENOENT')throw e;}
          loaded=true;
        }
        let record=records.profiles[profile];
        if(record&&(![true,false,null].includes(record.original)||typeof record.boot!=='boolean'||typeof record.launch!=='string'))throw Error('Invalid appearance record');
        if(!enabled&&!record){state={state:'off',ready:false,restoreVibrancy:null};return state;}
        const current=await read(entry);if(typeof current!=='boolean')throw Error('Native appearance unavailable');
        const boot=record?.launch===launchId?record.boot:current;
        record={launch:launchId,boot,original:record?.original??null};
        if(enabled){
          if(record.original===null)record.original=current;
          records.profiles[profile]=record;await save(); // Recovery precedes mutation.
          if(!current)await preference(entry,true);
          state={state:boot?'ready':'restart-required',ready:boot,restoreVibrancy:record.original};
        }else{
          const original=record.original;
          // If the user has independently turned native transparency off,
          // respect that choice rather than turning it back on during cleanup.
          if(original!==null&&current&&current!==original)await preference(entry,original);
          record.original=null;records.profiles[profile]=record;await save();
          state={state:'off',ready:false,restoreVibrancy:current?(original??current):false};
        }
      }catch{state={state:'unavailable',ready:false,restoreVibrancy:state.restoreVibrancy};}
      return state;
    });return preparing;
  }
  function update(entry,{enabled=false,identity=null}={}){
    if(disposed)return Promise.resolve(false);
    const wanted=enabled&&state.ready;
    let page=pages.get(entry.sessionId);
    if(!page){if(!wanted&&state.restoreVibrancy===null)return Promise.resolve(false);page={tail:Promise.resolve(),key:null,active:false};pages.set(entry.sessionId,page);}
    const restore=state.restoreVibrancy;
    const key=JSON.stringify([wanted,identity,restore]);
    if(page.key===key)return page.tail;
    page.key=key;
    page.tail=page.tail.catch(()=>false).then(async()=>{
      try{page.active=await cdp.evaluate(`window.__PME_TRIAGE__?.setInboxGlass(${wanted},${JSON.stringify(restore)})`,entry.sessionId)===true;}
      catch{page.active=false;}
      return page.active;
    });return page.tail;
  }
  return {prepare,update,
    detach:entry=>{pages.delete(entry.sessionId);},
    status:()=>({...state,active:[...pages.values()].some(p=>p.active)}),
    async dispose(sessions){disposed=true;await preparing.catch(()=>{});for(const entry of sessions.values()){
      const page=pages.get(entry.sessionId);if(!page)continue;
      await page.tail.catch(()=>{});
      await cdp.evaluate('window.__PME_TRIAGE__?.setInboxGlass(false)',entry.sessionId).catch(()=>{});
    }pages.clear();}
  };
}
