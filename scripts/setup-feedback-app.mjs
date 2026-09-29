// One-time GitHub App registration. Secrets are written only to an ignored,
// owner-readable local file, never to the browser, terminal, or repository.
import http from 'node:http';import crypto from 'node:crypto';import fs from 'node:fs/promises';import path from 'node:path';
const directory=path.resolve('.lab/private-feedback'),file=path.join(directory,'github-app.json');
await fs.mkdir(directory,{recursive:true,mode:0o700});
if(await fs.stat(file).catch(()=>null))throw Error('Registration already saved. Reuse the existing app instead of creating another.');
const nonce=crypto.randomBytes(24).toString('hex');let converted=false;
const server=http.createServer(async(req,res)=>{
 const base=`http://127.0.0.1:${server.address().port}`,url=new URL(req.url,base);
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Referrer-Policy','no-referrer');
 if(req.headers.host!==new URL(base).host){res.writeHead(403).end();return;}
 try{
  if(url.pathname===`/start/${nonce}`){
   const manifest={name:'PME Feedback',url:'https://github.com/Sy14r/PimpMyElectron',description:'Receive user-reviewed PME feedback as public issues in PimpMyElectron.',public:false,redirect_url:base+'/callback',hook_attributes:{url:'https://github.com/Sy14r/PimpMyElectron',active:false},default_permissions:{issues:'write'},default_events:[]};
   res.end(`<h1>PME feedback service</h1><p>Create a private GitHub App with Issues read/write permission. On the installation screen, select only Sy14r/PimpMyElectron.</p><form action="https://github.com/settings/apps/new?state=${nonce}" method="post"><input type="hidden" name="manifest" value="${JSON.stringify(manifest).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"><button>Create GitHub App</button></form>`);return;
  }
  if(url.pathname==='/callback'&&url.searchParams.get('state')===nonce&&!converted&&/^[a-zA-Z0-9]+$/.test(url.searchParams.get('code')||'')){
   converted=true;
   const result=await fetch('https://api.github.com/app-manifests/'+url.searchParams.get('code')+'/conversions',{method:'POST',headers:{Accept:'application/vnd.github+json','User-Agent':'PME-feedback-setup'},redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!result.ok)throw Error('Registration exchange failed.');
   const app=await result.json();if(!app.id||!app.pem||!/^https:\/\/github.com\/apps\/[a-z0-9-]+$/.test(app.html_url))throw Error('Unexpected registration response.');
   const pem=crypto.createPrivateKey(app.pem).export({format:'pem',type:'pkcs8'});
   await fs.writeFile(file,JSON.stringify({appId:String(app.id),privateKey:pem,url:app.html_url}),{mode:0o600,flag:'wx'});
   console.log('GitHub App registered; credentials saved privately. Install it on PimpMyElectron only.');
   res.end(`<h1>App created</h1><p>The credential is saved privately on this Mac. Now install it with access to <b>Only select repositories → Sy14r/PimpMyElectron</b>.</p><a href="${app.html_url}/installations/new">Install PME Feedback</a>`);return;
  }
  res.writeHead(404).end('Not found.');
 }catch{res.writeHead(500).end('Setup could not finish. Return to Codex; no secret is shown here.');}
});
server.listen(0,'127.0.0.1',()=>console.log(`Open http://127.0.0.1:${server.address().port}/start/${nonce}`));
setTimeout(()=>server.close(),3600000).unref();
