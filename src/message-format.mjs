const decode=s=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
export function messageParts(text,names=new Map(),channels=new Map()){
 const result=[],pattern=/```[\s\S]*?```|`[^`\n]+`|<[^>\n]+>|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~/g;let start=0;
 const add=(type,value,href)=>result.push({type,text:decode(value),...(href?{href}:{})});
 for(const match of String(text||'').slice(0,4000).matchAll(pattern)){
  if(match.index>start)add('text',text.slice(start,match.index));const token=match[0];start=match.index+token.length;
  if(token.startsWith('```'))add('pre',token.slice(3,-3));
  else if(token.startsWith('`'))add('code',token.slice(1,-1));
  else if(token.startsWith('*'))add('strong',token.slice(1,-1));
  else if(token.startsWith('_'))add('em',token.slice(1,-1));
  else if(token.startsWith('~'))add('s',token.slice(1,-1));
  else if(/^<@[UW][A-Z0-9]+>$/.test(token)){const id=token.slice(2,-1);add('mention','@'+(names.get(id)||id));}
  else if(/^<#[CDG][A-Z0-9]+(?:\|[^>]+)?>$/.test(token)){const [id,label]=token.slice(2,-1).split('|');add('mention','#'+(label||channels.get(id)||id));}
  else if(/^<!(here|channel|everyone)>$/.test(token))add('mention','@'+token.slice(2,-1));
  else{const [url,label]=token.slice(1,-1).split('|');try{const parsed=new URL(decode(url));if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error();add('a',label||url,parsed.href);}catch{add('text',token);}}
 }
 if(start<text.length)add('text',text.slice(start,4000));return result;
}
