import {validateReport, issueURL} from '../../services/feedback/protocol.mjs';
import fs from 'node:fs/promises';import path from 'node:path';
export async function submitFeedback(root, report, {fetcher=fetch}={}) {
  report=validateReport(report);
  const config=JSON.parse(await fs.readFile(path.join(root,'client/feedback.json'),'utf8'));
  const endpoint=new URL(config.endpoint);
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.pathname!=='/v1/reports'||endpoint.search||endpoint.hash)throw Error('Feedback is not configured in this build. Please copy your report.');
  let response;
  try{response=await fetcher(endpoint.href,{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});}
  catch{throw Error('Could not confirm submission. Your report has been kept. Retry to check its status without creating a duplicate.');}
  let result;try{result=await response.json();}catch{throw Error('Could not confirm submission. Keep this report and retry.');}
  if(response.status===202&&result.pending===true)return {pending:true};
  if(!response.ok){const messages={400:'This report is invalid or over a week old. Copy it before starting a new report.',409:'The reviewed report changed. Please review it again.',429:'Too many reports right now. Your report has been kept; please try again later.',503:'Feedback is temporarily unavailable. Your report has been kept; please try again later.'};throw Error(messages[response.status]||'Could not submit feedback. Your report has been kept; please retry later.');}
  if(!issueURL(result.url))throw Error('Could not confirm submission. Keep this report and retry.');
  return {url:result.url};
}
