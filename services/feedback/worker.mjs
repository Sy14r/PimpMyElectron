import {validateReport} from './protocol.mjs';
import {githubToken, githubAPI} from './github.mjs';
export const json = (value, status = 200) => Response.json(value, {status, headers:{'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'}});
const digest = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), n => n.toString(16).padStart(2,'0')).join('');
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/v1/reports') return json({error:'Not found.'},404);
    if (request.method !== 'POST') return json({error:'Method not allowed.'},405);
    // Native app requests have no Origin. No browser CORS access or embedded secrets.
    if (request.headers.has('Origin')) return json({error:'Submit feedback from PME.'},403);
    if (!env.GITHUB_APP_ID || !env.GITHUB_INSTALLATION_ID || !env.GITHUB_APP_PRIVATE_KEY || !env.IP_HASH_SECRET) return json({error:'Feedback service is not configured yet. Please copy your report.'},503);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'Expected JSON.'},415);
    let report;
    try {
      const reader=request.body?.getReader();if(!reader)return json({error:'Empty report.'},400);
      const chunks=[];let length=0;
      while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>30000){await reader.cancel();return json({error:'Report is too large.'},413);}chunks.push(value);}
      const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
      report=validateReport(JSON.parse(new TextDecoder().decode(bytes)));
    } catch { return json({error:'Invalid or expired report. Check the title and description.'},400); }
    const ip=request.headers.get('CF-Connecting-IP');if(!ip)return json({error:'Could not validate the request.'},400);
    // Daily salted hash; raw addresses and report contents are never stored or logged.
    const client=await digest(env.IP_HASH_SECRET + ':' + Math.floor(Date.now()/86400000) + ':' + ip);
    return env.REPORTS.get(env.REPORTS.idFromName('reports')).fetch(new Request('https://internal/report',{method:'POST',body:JSON.stringify({report,client})}));
  }
};
export class FeedbackReports {
  constructor(ctx, env, {connect=async()=>githubAPI(await githubToken(env))}={}) {this.ctx=ctx;this.env=env;this.connect=connect;}
  async fetch(request) {
    const {report,client}=await request.json(), now=Date.now(), key='report:'+report.requestId;
    const hash=await digest(JSON.stringify([report.title,report.body]));
    const claim=await this.ctx.storage.transaction(async storage => {
      const existing=await storage.get(key);
      if(existing){
        if(existing.hash!==hash)return {conflict:true};
        if(existing.state==='retry'){
          if(now-existing.at<30000)return {cooldown:true};
          await storage.put(key,{hash,state:'pending',at:now});return {claimed:true};
        }
        if(existing.state==='pending'&&now-existing.at>=30000)await storage.put(key,{...existing,at:now});
        return existing;
      }
      const day=Math.floor(now/86400000),hour=Math.floor(now/3600000),ipKey=`rate:${day}:${client}:${hour}`,globalKey=`rate:${day}:global`;
      const perIP=await storage.get(ipKey)||0,total=await storage.get(globalKey)||0;
      if(perIP>=5||total>=50)return {limited:true};
      await storage.put({[ipKey]:perIP+1,[globalKey]:total+1,[key]:{hash,state:'pending',at:now}});
      return {claimed:true};
    });
    if(!await this.ctx.storage.getAlarm())await this.ctx.storage.setAlarm(now+86400000);
    if(claim.cooldown)return json({error:'Please wait 30 seconds before retrying this report.'},503);
    if(claim.conflict)return json({error:'This report changed. Review it again before sending.'},409);
    if(claim.limited)return json({error:'Too many reports right now. Please keep your report and try again later.'},429);
    if(claim.url)return json({url:claim.url});
    const pending=()=>json({pending:true,message:'Your report may have been received. Check again using this same report; PME will not create a duplicate.'},202);
    if(!claim.claimed && now-claim.at<30000)return pending();
    let api;
    try{api=await this.connect();}catch(error){
      if(claim.claimed)await this.ctx.storage.put(key,{hash,state:'retry',at:now});
      return json({error:'Feedback service is temporarily unavailable. Your report has been kept; please retry.',code:'github_auth_unavailable'},503);
    }
    try {
      // Never POST again after an ambiguous response. Reconcile only by marker.
      const url=claim.claimed?await api.create(report):await api.find(report);
      if(!url)return pending();
      await this.ctx.storage.put(key,{hash,state:'sent',at:now,url});return json({url});
    } catch(error) {
      if(claim.claimed&&error.definite){await this.ctx.storage.put(key,{hash,state:'retry',at:now});return json({error:'Feedback could not be submitted. Your report has been kept; please retry later.'},503);}
      return pending();
    }
  }
  async alarm() {
    const now=Date.now();
    for(const [key,value] of await this.ctx.storage.list()){
      if(key.startsWith('rate:')&&Number(key.split(':')[1])<Math.floor(now/86400000)-1||key.startsWith('report:')&&now-Number(key.slice(7,20))>8*86400000)await this.ctx.storage.delete(key);
    }
    await this.ctx.storage.setAlarm(now+86400000);
  }
}
