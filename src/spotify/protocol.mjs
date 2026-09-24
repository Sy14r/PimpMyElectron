export function validateLibraryRequest(r){
 if(!r||typeof r!=='object'||Array.isArray(r))throw Error('Invalid library request');
 const ops=new Set(['status','capabilities','library','collection','search','queue','play','addqueue','playback-modes','shuffle','repeat']);
 if(!ops.has(r.op))throw Error('Unsupported library action');
 const clean={op:r.op};
 if(r.op==='shuffle'){if(typeof r.enabled!=='boolean')throw Error('Invalid shuffle state');clean.enabled=r.enabled;}
 if(r.op==='repeat'){if(![0,1,2].includes(r.mode))throw Error('Invalid repeat mode');clean.mode=r.mode;}
 if(r.offset!==undefined){if(!Number.isInteger(r.offset)||r.offset<0||r.offset>10000)throw Error('Invalid page');clean.offset=r.offset;}
 if(r.scope!==undefined){if(!['all','playlists','albums','liked'].includes(r.scope))throw Error('Invalid library filter');clean.scope=r.scope;}
 if(r.query!==undefined){if(typeof r.query!=='string'||r.query.length>200)throw Error('Search is too long');clean.query=r.query.trim();}
 for(const key of ['uri','context'])if(r[key]!==undefined){if(typeof r[key]!=='string'||!(/^spotify:(track|episode|playlist|album):[a-zA-Z0-9]{22}$/.test(r[key])||r[key]==='spotify:collection:tracks'))throw Error('Invalid Spotify item');clean[key]=r[key];}
 if(r.uid!==undefined){if(typeof r.uid!=='string'||r.uid.length>150||!/^[a-zA-Z0-9_-]*$/.test(r.uid))throw Error('Invalid queue item');clean.uid=r.uid;}
 if(['collection','play','addqueue'].includes(r.op)&&!clean.uri)throw Error('Choose a Spotify item');
 return clean;
}
export function searchDefinition(source){const match=source.match(/new\s+[\w$.]+\("searchDesktop","query","([a-f0-9]{64})",null\)/);if(!match)return null;return {name:'searchDesktop',operation:'query',sha256Hash:match[1],value:null};}
