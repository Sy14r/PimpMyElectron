// Runs only in Spotify's trusted top-level xpui renderer. Only normalized music
// data leaves this closure; account/session objects and arbitrary evaluation do not.
(() => {
  if(window!==window.top||location.origin!=="https://xpui.app.spotify.com")return false;
  const version=2;
  if(window.__PMESpotify?.version===version)return true;
  let services,queries;
  const uriOK=u=>typeof u==='string'&&/^spotify:(track|episode|playlist|album):[a-zA-Z0-9]{22}$/.test(u);
  const image=value=>{
    if(typeof value!=='string')return '';
    if(/^spotify:image:[a-f0-9]{40}$/.test(value))return 'https://i.scdn.co/image/'+value.slice(14);
    try{const u=new URL(value);return u.protocol==='https:'&&['i.scdn.co','pickasso.spotifycdn.com','mosaic.scdn.co','image-cdn-ak.spotifycdn.com','image-cdn-fa.spotifycdn.com'].includes(u.hostname)&&!u.username&&!u.password&&(!u.port||u.port==='443')?u.href:'';}catch{return '';}
  };
  function normalize(raw,index=0){
    let t=raw?.item?.data||raw?.data||raw?.track||raw;
    if(!t||typeof t!=='object')return null;
    const uri=t.uri;if(!uriOK(uri)&&uri!=='spotify:collection:tracks')return null;
    const type=uri.split(':')[1];
    const album=t.album||t.albumOfTrack;
    const artists=t.artists?.items||t.artists||album?.artists?.items||[];
    const images=t.images||t.coverArt?.sources||t.images?.items?.[0]?.sources||album?.images||album?.coverArt?.sources||[];
    const list=Array.isArray(images)?images:images.items?.flatMap(i=>i.sources||[])||[];
    return {id:uri,uri,type,name:String(t.name||t.profile?.name||'Untitled').slice(0,300),subtitle:artists.map(a=>a.name||a.profile?.name||'').filter(Boolean).join(', ').slice(0,300)||t.owner?.name||t.ownerV2?.data?.name||type,
      image:image(list.find(i=>i.width===300||i.label==='standard')?.url||list[0]?.url),duration:t.duration?.milliseconds||t.duration?.totalMilliseconds||0,
      playable:t.isPlayable!==false&&t.playability?.playable!==false,uid:String(raw?.uid||t.uid||''),index};
  }
  function discover(){
    if(services)return services;
    const root=document.getElementById('main');if(!root)throw Error('Spotify is still starting.');
    const key=Object.keys(root).find(k=>k.startsWith('__reactContainer'));
    const fiber=root[key]?.stateNode?.current;if(!fiber)throw Error('Spotify’s renderer is not ready.');
    const todo=[fiber];let count=0,di;
    while(todo.length&&count++<1200){const f=todo.pop();if(f.sibling)todo.push(f.sibling);if(f.child)todo.push(f.child);const v=f.memoizedProps?.value;if(typeof v?.resolve==='function'&&v?._map instanceof Map){try{if(v.resolve(Symbol.for('LibraryAPI'))?.getContents){di=v;break;}}catch{}}}
    if(!di)throw Error('This Spotify version does not expose the expected library interface.');
    services={};for(const key of ['LibraryAPI','PlaylistAPI','PlayerAPI','GraphQLLoader'])services[key]=di.resolve(Symbol.for(key));
    return services;
  }
  function albumQuery(){
    if(queries?.album)return queries.album;
    let req;window.rspackChunk?.push([['pme_mini_library'],{},r=>req=r]);
    if(!req)throw Error('Album browsing is unavailable on this Spotify version.');
    for(const [id,f] of Object.entries(req.m)){const s=String(f);if(s.length<4000&&s.includes('"queryAlbumTracks"')){const q=Object.values(req(id)).find(v=>v?.name==='queryAlbumTracks'&&/^[a-f0-9]{64}$/.test(v.sha256Hash));if(q){queries={...queries,album:q};return q;}}}
    throw Error('Album browsing is unavailable on this Spotify version.');
  }
  const cache=new Map();
  async function cached(key,work){const c=cache.get(key);if(c&&Date.now()-c.at<20000)return c.value;const value=await work();if(cache.size>=24)cache.delete(cache.keys().next().value);cache.set(key,{at:Date.now(),value});return value;}
  function page(r,offset,limit){const raw=r.items||[];const items=raw.map((v,i)=>normalize(v,offset+i)).filter(Boolean);const total=Number(r.totalLength||r.totalCount||0);return {items,offset,total,hasMore:total>0?offset+raw.length<total:raw.length>=limit};}
  function playbackModes(player){
    const state=player.getState(),r=state?.restrictions||{};
    if(!state||typeof state.shuffle!=='boolean'||![0,1,2].includes(state.repeat))throw Error('Playback modes are unavailable on this Spotify version.');
    return {shuffle:state.shuffle,repeat:state.repeat,
      canShuffle:state.hasContext===true&&r.canToggleShuffle===true,
      canRepeatContext:state.hasContext===true&&r.canToggleRepeatContext===true,
      canRepeatTrack:state.hasContext===true&&r.canToggleRepeatTrack===true};
  }
  async function invoke(req){
    const s=discover(),limit=30,offset=Math.max(0,Math.min(10000,Number(req.offset)||0));
    switch(req.op){
      case 'capabilities':return {library:true,search:!!window.__PMESpotifySearchQuery,queue:true};
      case 'library':return cached(JSON.stringify(req),async()=>{
        if(req.scope==='liked')return page(await s.LibraryAPI.getTracks({offset,limit}),offset,limit);
        const filters=req.scope==='playlists'?['2']:req.scope==='albums'?['0']:[];
        const r=await s.LibraryAPI.getContents({offset,limit,filters,...(req.query?{textFilter:req.query}:{} )});
        const p=page(r,offset,limit);if(offset===0&&!req.query&&req.scope==='all')p.items.unshift({id:'spotify:collection:tracks',uri:'spotify:collection:tracks',name:'Liked Songs',subtitle:'Your saved tracks',type:'collection',image:'',playable:true,index:0,uid:''});return p;
      });
      case 'collection':return cached(JSON.stringify(req),async()=>{
        if(req.uri==='spotify:collection:tracks')return page(await s.LibraryAPI.getTracks({offset,limit}),offset,limit);
        if(!uriOK(req.uri))throw Error('Unsupported collection.');
        if(req.uri.startsWith('spotify:playlist:'))return page(await s.PlaylistAPI.getContents(req.uri,{offset,limit}),offset,limit);
        if(req.uri.startsWith('spotify:album:')){const r=await s.GraphQLLoader(albumQuery(),{uri:req.uri,offset,limit});const tracks=r.data?.albumUnion?.tracksV2;if(!tracks)throw Error('Spotify could not load this album.');return page(tracks,offset,limit);}
        throw Error('This collection type is not supported yet.');
      });
      case 'search':return cached(JSON.stringify(req),async()=>{
        if(typeof req.query!=='string'||!req.query.trim())return {items:[],hasMore:false};
        const q=window.__PMESpotifySearchQuery;if(!q)throw Error('Search is unavailable on this Spotify version.');
        const r=await s.GraphQLLoader(q,{searchTerm:req.query,offset,limit:8,numberOfTopResults:5,includeAudiobooks:false,includeArtistHasConcertsField:false,includePreReleases:false,includeAlbumPreReleases:false,includeAuthors:false,includeEpisodeContentRatingsV2:false});
        if(!r.data?.searchV2)throw Error('Spotify could not complete this search.');
        const v=r.data.searchV2;return {items:[...(v.tracksV2?.items||[]),...(v.albumsV2?.items||[]),...(v.playlists?.items||[])].map(normalize).filter(Boolean),hasMore:false};
      });
      case 'playback-modes':return playbackModes(s.PlayerAPI);
      case 'shuffle':{
        if(typeof req.enabled!=='boolean')throw Error('Invalid shuffle state');
        if(!playbackModes(s.PlayerAPI).canShuffle)throw Error('Shuffle is unavailable for this playback context.');
        await s.PlayerAPI.setShuffle(req.enabled);return {changed:true};
      }
      case 'repeat':{
        if(![0,1,2].includes(req.mode))throw Error('Invalid repeat mode');
        const m=playbackModes(s.PlayerAPI);
        if((req.mode===1&&!m.canRepeatContext)||(req.mode===2&&!m.canRepeatTrack)||(req.mode===0&&!(m.repeat===1?m.canRepeatContext:m.canRepeatTrack)))throw Error('Repeat is unavailable for this playback context.');
        await s.PlayerAPI.setRepeat(req.mode);return {changed:true};
      }
      case 'queue':{const q=s.PlayerAPI.getQueue();return {items:[...(q.queued||[]),...(q.nextUp||[])].slice(0,40).map(normalize).filter(Boolean),hasMore:false};}
      case 'play':{
        if(!uriOK(req.uri))throw Error('Unsupported track.');
        const context=((req.context&&uriOK(req.context))||req.context==='spotify:collection:tracks')?req.context:null;
        const options=context?{skipTo:req.uid?{uid:req.uid}:{uri:req.uri}}:{};
        await s.PlayerAPI.play({uri:context||req.uri},{featureIdentifier:'pme_mini_library'},options);return {played:true};
      }
      case 'addqueue':if(!uriOK(req.uri)||!/^spotify:(track|episode):/.test(req.uri))throw Error('Unsupported queue item.');await s.PlayerAPI.addToQueue([{uri:req.uri}]);return {queued:true};
      default:throw Error('Unsupported library action.');
    }
  }
  Object.defineProperty(window,'__PMESpotify',{value:{version,invoke},configurable:true});
  return true;
})();
