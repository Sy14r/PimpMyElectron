// A short bridge across the badge/card gap. Only a preview issued by the host
// may acquire a helper lease; scope/read-state are revalidated by the caller.
export function createPreviewSession({now=Date.now}={}) {
  let current=null,heldUntil=0;
  return {
    update(sessionId,mode,request){
      if(mode!=='cluster'){if(current?.sessionId===sessionId)this.clear();return;}
      if(request){if(request.key!==current?.request.key)heldUntil=0;current={sessionId,request,at:now(),leftAt:null};}
      else if(current?.sessionId===sessionId&&current.leftAt===null)current.leftAt=now();
    },
    hold(key){if(current&&key===current.request.key)heldUntil=now()+1200;},
    get(){return current&&((current.leftAt===null?now()-current.at<3000:now()-current.leftAt<1100)||now()<heldUntil)?current:null;},
    held(sessionId){return current?.sessionId===sessionId&&now()<heldUntil;},
    clear(){current=null;heldUntil=0;}
  };
}
