import {issueURL} from './protocol.mjs';
const base = 'https://api.github.com', repo = '/repos/Sy14r/PimpMyElectron';
const encode = value => btoa(typeof value === 'string' ? value : String.fromCharCode(...new Uint8Array(value))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
export async function appJWT(env, now = Date.now()) {
  const pem = env.GITHUB_APP_PRIVATE_KEY.replace(/-----[^-]+-----|\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, false, ['sign']);
  const payload = encode(JSON.stringify({alg:'RS256', typ:'JWT'})) + '.' + encode(JSON.stringify({iat:Math.floor(now/1000)-60, exp:Math.floor(now/1000)+300, iss:env.GITHUB_APP_ID}));
  return payload + '.' + encode(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(payload)));
}
export async function githubToken(env, fetcher = fetch) {
  const response = await fetcher(`${base}/app/installations/${env.GITHUB_INSTALLATION_ID}/access_tokens`, {
    method:'POST', redirect:'manual', signal:AbortSignal.timeout(8000),
    headers:{Authorization:`Bearer ${await appJWT(env)}`, Accept:'application/vnd.github+json', 'User-Agent':'PME-feedback', 'Content-Type':'application/json', 'X-GitHub-Api-Version':'2022-11-28'},
    body:JSON.stringify({repositories:['PimpMyElectron'], permissions:{issues:'write'}})
  });
  if (!response.ok) throw Object.assign(Error('Feedback service is temporarily unavailable.'),{status:response.status});
  const result = await response.json();if (!result.token) throw Error('Feedback service is temporarily unavailable.');return result.token;
}
export function githubAPI(token, fetcher = fetch) {
  const send = (path, init = {}) => fetcher(base + repo + path, {...init, redirect:'manual', signal:AbortSignal.timeout(10000), headers:{Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'User-Agent':'PME-feedback', 'Content-Type':'application/json', 'X-GitHub-Api-Version':'2022-11-28'}});
  return {
    async create(report) {
      // Keep user text out of service metadata, and preserve only the reviewed report.
      const response = await send('/issues', {method:'POST', body:JSON.stringify({title:report.title, body:report.body + `\n\n<!-- pme-feedback:${report.requestId} -->`})});
      if (!response.ok) {const error = Error('Feedback service is temporarily unavailable.');error.definite = [400,401,403,404,422,429].includes(response.status);throw error;}
      const issue = await response.json();if (!issueURL(issue.html_url)) throw Error('Unexpected issue response.');return issue.html_url;
    },
    async find(report) {
      const response = await send('/issues?state=all&sort=created&direction=desc&per_page=100&since=' + encodeURIComponent(new Date(Number(report.requestId.slice(0,13))-300000).toISOString()));
      if (!response.ok) return null;
      const issues = await response.json();
      const found = Array.isArray(issues) && issues.find(i => !i.pull_request && i.body?.endsWith(`<!-- pme-feedback:${report.requestId} -->`));
      return found && issueURL(found.html_url) ? found.html_url : null;
    }
  };
}
