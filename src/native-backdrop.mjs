// Geometry only: never send message content or arbitrary native commands to
// the helper. It independently verifies the owning Slack process/window.
export function nativeBackdrop({id,slackPID,geometry,enabled=false}){
 if(!enabled||typeof id!=='string'||!Number.isInteger(slackPID)||slackPID<=0)return null;
 const valid=r=>r&&['x','y','width','height'].every(k=>typeof r[k]==='number'&&Number.isFinite(r[k]))&&Math.abs(r.x)<100000&&Math.abs(r.y)<100000;
 const w=geometry?.window,r=geometry?.inbox;if(!valid(w)||!valid(r))return null;
 if(w.width<420||w.width>820||w.height<240||w.height>8192||r.width<1||r.width>420||r.height<1||r.height>w.height+1)return null;
 if(r.x<w.x-1||r.y<w.y-1||r.x+r.width>w.x+w.width+1||r.y+r.height>w.y+w.height+1)return null;
 const rect=v=>Object.fromEntries(['x','y','width','height'].map(k=>[k,v[k]]));
 return {id,slackPID,window:rect(w),inbox:rect(r)};
}
