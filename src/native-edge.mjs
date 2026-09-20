// The companion only needs geometry and a scoped count, never message content.
export const unreadItemCount = workspaces => workspaces.reduce((n,w)=>n+w.items.filter(i=>i.unread===true&&!i.pendingRead&&!['done','later'].includes(i.triage?.state)).length,0);
export const filterNotificationWorkspaces = (workspaces,settings,inboxScope) => workspaces.filter(w=>
  settings.notificationMode==='inbox'?inboxScope==='*'||w.id===inboxScope:
  settings.notificationMode==='selected'?(settings.notificationWorkspaces||[]).includes(w.id):true);
// Global notification destinations are separate from the inbox's content scope.
// Keep message bodies in the selected inbox or the explicitly hovered preview.
export const notificationSummaries = workspaces => workspaces.map(w=>({id:w.id,name:w.name,items:w.items.map(i=>({
  key:i.key,workspaceId:w.id,workspaceName:w.name,channelId:i.channelId,threadTs:i.threadTs,
  name:i.name,kind:i.kind,pendingRead:i.pendingRead,unread:i.unread,unreadCount:i.unreadCount,latest:i.latest,
  triage:{state:i.triage?.state},messages:[]
}))}));
export function nativeEdgeStrip(workspaces, request) {
  const b=request?.bounds;
  if(!request || !/^[a-z0-9-]{1,80}$/.test(request.id||'') || !['left','right'].includes(request.edge) ||
    !b || !['x','y','width','height'].every(k=>Number.isFinite(b[k])) ||
    Math.abs(b.x)>100000 || Math.abs(b.y)>100000 || b.width!==12 || b.height<44 || b.height>4096) return null;
  const count=unreadItemCount(workspaces);
  return {id:request.id,edge:request.edge,bounds:{x:b.x,y:b.y,width:b.width,height:b.height},count};
}
