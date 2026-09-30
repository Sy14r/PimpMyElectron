// Build account-free product screenshots from the checked-in UI renderers.
// No Slack/Spotify process, profile, authentication, or network data is used.
import fs from 'node:fs/promises';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url)),out=path.join(root,'site/assets'),lab=path.join(root,'.lab/site-assets');
await fs.mkdir(out,{recursive:true});await fs.mkdir(lab,{recursive:true});
const chrome=process.env.PME_SCREENSHOT_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const html=script=>`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'"><style>html,body{margin:0;background:#141925;color:#cdd4e4}</style></head><body><script>${script.replaceAll('</script','<\\/script')}</script></body></html>`;
async function capture(name,source,width,height){
 if(process.argv[2]&&process.argv[2]!==name)return;
 const file=path.join(lab,name+'.html');await fs.writeFile(file,source);
 const profile=await fs.mkdtemp(path.join(lab,'chrome-'));
 try{
  const result=spawnSync(chrome,['--headless','--disable-gpu','--hide-scrollbars','--disable-background-networking','--no-first-run','--no-default-browser-check','--force-device-scale-factor=2',`--user-data-dir=${profile}`,`--window-size=${width},${height}`,'--virtual-time-budget=1000',`--screenshot=${path.join(out,name+'.png')}`,pathToFileURL(file).href],{encoding:'utf8',timeout:30000});
  if(result.status!==0)throw Error(result.stderr||'Screenshot renderer failed');
  console.log(name+'.png');
 }finally{await fs.rm(profile,{recursive:true,force:true});}
}
const names=[['Maya Chen','dm','The preview looks great. Ready for one last look?',true],['Launch checklist','thread','All the copy is in. Just waiting on the final screenshots.',true],['product-design','channel','I’ve added the updated onboarding flow to the canvas.',true],['Theo Park','dm','Thanks! I’ll pick this up after lunch.',false],['engineering','channel','The build is ready for a quick smoke test.',false],['Friday review','thread','Let’s keep the first release small and focused.',false]];
const now=new Date();now.setHours(10,42,0,0);
const items=names.map(([name,kind,text,unread],i)=>({key:'TDEMO:CDEMO'+i+':',workspaceId:'TDEMO',channelId:'CDEMO'+i,name,kind,unread,unreadCount:null,starred:i<2,messages:[{ts:String(now.getTime()/1000-i*240),author:i%2?'Theo Park':'Maya Chen',text}],triage:{state:'active',needsAction:unread}}));
const snapshot={selectedWorkspace:'TDEMO',workspaceDirectory:[{id:'TDEMO',name:'Studio North',connected:true}],workspaces:[{id:'TDEMO',name:'Studio North',items}],settings:{edge:'left',rest:'strip',inboxDensity:'expanded',idleSeconds:60,notificationScope:'all'}};
let triage=await fs.readFile(path.join(root,'src/renderer/triage.js'),'utf8');
triage=triage.replace("if (window.top !== window || location.origin !== 'https://app.slack.com') return;",'if(window.top!==window)return;').replace("const team = () => location.pathname.match(/^\\/client\\/([TE][A-Z0-9]+)/)?.[1];","const team = () => 'TDEMO';");
if(triage.includes('const team = () => location.'))throw Error('Screenshot fixture entry changed');
for(const [name,mode,width,height] of [['slack-inbox','queue',420,730],['slack-pill','cluster',120,250],['slack-strip','strip',120,250]]){
 const fixture=triage.replace('  observe();render();',`  snapshot=${JSON.stringify(snapshot)};settings={...settings,...snapshot.settings};lastHostUpdate=Date.now();mode=${JSON.stringify(mode)};edge='left';selection=${mode==='queue'?JSON.stringify(items[0].key):'null'};applyLayout();render();${mode==='strip'?"const captureStyle=document.createElement('style');captureStyle.textContent='#edge-tab{width:12px;height:88px;inset:80px auto auto 0}';shadow.append(captureStyle);":''}`);
 await capture(name,html(`window.__PME_REPLY__={status:()=>({active:false}),suspend(){}};${fixture}`),width,height);
}
const catalog=JSON.parse(await fs.readFile(path.join(root,'client/catalog.json'),'utf8'));
const state={platform:'mac',catalogVersion:catalog.version,clientVersion:JSON.parse(await fs.readFile(path.join(root,'client/version.json'),'utf8')).version,apps:catalog.apps.map(a=>({...a,mods:a.mods.map(m=>({...m,compatible:true})),installations:[{path:'/Applications/'+a.name+'.app',verified:true}],selectedPath:'/Applications/'+a.name+'.app',selectedMods:a.mods.filter(m=>m.defaultEnabled).map(m=>m.id),shortcuts:[],runtime:{running:false}}))};
let manager=await fs.readFile(path.join(root,'client/ui/app.js'),'utf8');manager=manager.slice(0,manager.lastIndexOf("render();void action('scan');"))+`state=${JSON.stringify(state)};render();`;
const css=await fs.readFile(path.join(root,'client/ui/style.css'),'utf8'),icon=await fs.readFile(path.join(root,'client/ui/icon.svg'),'utf8');
manager=manager.replace('src="icon.svg"',`src="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}"`);
await capture('mod-manager',html(manager).replace('<body>',`<style>${css}</style><body><div id="app"></div><div id="toast"></div>`),1080,720);
await fs.copyFile(path.join(root,'client/ui/icon.svg'),path.join(out,'pme.svg'));
await fs.writeFile(path.join(out,'README.md'),'# Product visuals\n\n`slack-inbox.png`, `slack-pill.png`, and `slack-strip.png` render the current Slack Triage code with fictional Studio North messages. `mod-manager.png` renders the current manager with synthetic installation data. No account data is used. Regenerate on macOS with `node scripts/site-assets.mjs` (requires Google Chrome). The native conversation illustration on the page is explicitly labeled.\n');
