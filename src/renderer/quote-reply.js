(() => {
  if (window.__PME_QUOTE_REPLY__ || location.origin !== 'https://app.slack.com') return;
  const MESSAGE='[data-qa="message_container"]', ACTIONS='[data-qa="message-actions"]';
  const EDITOR='[data-qa="texty_input"][contenteditable="true"]';
  const THREAD='.p-threads_flexpane';
  const defaults={quoteAction:true,previewAction:true,previewShortcut:true,compactCards:true};
  const booleanKeys=Object.keys(defaults);
  const abort=new AbortController();
  let settings={...defaults},hovered={message:null,at:0};
  let overflowTarget={message:null,at:0};
  let disposed=false,scheduled=false,noticeTimer;
  const workspace=()=>location.pathname.match(/^\/client\/([TE][A-Z0-9]+)(?:\/|$)/)?.[1];
  const visible=node=>node?.isConnected&&node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden';
  function messageText(root) {
    if(!root)return '';
    function read(node){
      if(node.nodeType===3)return node.nodeValue||'';
      if(node.nodeType!==1||node.hidden||node.getAttribute('aria-hidden')==='true'||node.getAttribute('data-stringify-ignore')==='true'||['SCRIPT','STYLE','BUTTON'].includes(node.tagName))return '';
      if(node.tagName==='BR')return '\n';
      if(node.tagName==='IMG')return node.getAttribute('data-stringify-emoji')?`:${node.getAttribute('data-stringify-emoji')}:`:node.getAttribute('alt')||'';
      const value=[...node.childNodes].map(read).join('');
      return /^(DIV|P|LI|PRE|BLOCKQUOTE)$/.test(node.tagName)&&value&&!value.endsWith('\n')?value+'\n':value;
    }
    return read(root).replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').trim();
  }
  function destination(message){
    if(!visible(message)||!workspace())return null;
    const channel=message.getAttribute('data-msg-channel-id');
    if(!/^[CDG][A-Z0-9]+$/.test(channel||''))return null;
    const thread=message.closest(THREAD);
    // A search/activity preview must not borrow an unrelated open composer.
    if(!thread&&!message.closest('[data-qa="message_pane"]'))return null;
    const scope=thread||message.closest('.p-view_contents');
    if(!scope)return null;
    const candidates=[...scope.querySelectorAll(EDITOR)].filter(editor=>{
      const box=editor.closest('[data-qa="message_input"]');
      return visible(editor)&&!editor.closest(MESSAGE)&&editor.dataset.teamId===workspace()&&box?.dataset.channelId===channel&&
        (thread?editor.closest(THREAD)===thread&&/^\d+\.\d+$/.test(box.dataset.threadTs||''):!box.dataset.threadTs&&!editor.closest(THREAD));
    });
    if(candidates.length!==1)return null;
    const editor=candidates[0],box=editor.closest('[data-qa="message_input"]'),quill=box.__quill;
    if(!quill||quill.root!==editor||!['getContents','getLength','updateContents','setSelection','getModule','isEnabled'].every(k=>typeof quill[k]==='function')||!quill.isEnabled())return null;
    return {editor,quill,channel,threadTs:box.dataset.threadTs||null,workspaceId:workspace()};
  }
  function quoteDelta(text,rich=true){
    if(!rich)return {ops:[{insert:text.split('\n').map(line=>'> '+line).join('\n')+'\n\n'}]};
    const ops=[];
    for(const line of text.split('\n')){if(line)ops.push({insert:line});ops.push({insert:'\n',attributes:{blockquote:true}});}
    ops.push({insert:'\n'});return {ops};
  }
  function showNotice(text){
    let notice=document.getElementById('pme-quote-notice');
    if(!notice){notice=document.createElement('div');notice.id='pme-quote-notice';notice.setAttribute('role','status');document.body.append(notice);}
    notice.textContent=text;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.remove(),4500);
  }
  function quote(message){
    const target=destination(message),text=messageText(message?.querySelector('[data-qa="message-text"]'));
    if(!target||!text){showNotice('Open this message’s conversation or thread with an editable composer to quote it.');return false;}
    const {quill,editor}=target;
    if(text.length>20000||quill.getLength()+text.length>39000){showNotice('This quote and draft are too long. Shorten your draft or quote a shorter message.');return false;}
    // Use the native editor model, not DOM replacement, to preserve formatting,
    // mentions, draft persistence and undo. No send/navigation/API calls here.
    const formats=quill.options?.formats,rich=!Array.isArray(formats)||formats.includes('blockquote');
    const history=quill.getModule('history');
    try{
      history?.cutoff?.();quill.updateContents(quoteDelta(text,rich),'user');history?.cutoff?.();
      editor.focus();quill.setSelection(quill.getLength()-1,0,'user');
      return true;
    }catch{showNotice('Slack could not insert the quote. Check your draft before trying again.');return false;}
  }
  function parsePermalink(value){
    try{const url=new URL(String(value||'').trim());return url.protocol==='https:'&&url.hostname.endsWith('.slack.com')&&url.hostname!=='app.slack.com'&&/^\/archives\/[A-Z0-9]+\/p\d{16}\/?$/.test(url.pathname)?url.toString():null;}catch{return null;}
  }
  function timestampOf(message){
    for(const node of [message,...message.querySelectorAll('[data-ts],[data-msg-ts],[data-item-key],time,a[href]')]){
      for(const name of ['data-ts','data-msg-ts','data-item-key','id']){const match=String(node.getAttribute?.(name)||'').match(/(\d{10})\.(\d{6})/);if(match)return `${match[1]}.${match[2]}`;}
    }
    return null;
  }
  function permalinkFor(message){
    const links=new Set([...message.querySelectorAll('a[href]')].filter(link=>link.closest(MESSAGE)===message&&!link.closest('blockquote,[data-qa*="quote" i],[data-qa*="preview" i]')).map(link=>parsePermalink(link.href||link.getAttribute('href'))).filter(Boolean));
    if(links.size===1)return links.values().next().value;
    if(message.closest(THREAD))return null;
    const channel=message.getAttribute('data-msg-channel-id'),timestamp=timestampOf(message),team=workspace();
    if(!/^[CDG][A-Z0-9]+$/.test(channel||'')||!/^\d{10}\.\d{6}$/.test(timestamp||''))return null;
    try{
      const teams=JSON.parse(localStorage.getItem('localConfig_v2')||'{}').teams||{},direct=teams[team];
      const candidates=direct?.url?[direct.url]:[...new Set(Object.values(teams).filter(value=>value?.enterprise_id===team).map(value=>value.enterprise_url||value.url).filter(value=>typeof value==='string'))];
      if(candidates.length!==1)return null;
      return parsePermalink(new URL(`/archives/${channel}/p${timestamp.replace('.','')}`,candidates[0]).href);
    }catch{return null;}
  }
  function placeAtStart(editor,quill){
    try{editor.focus();quill.setSelection(0,0,'user');const selection=window.getSelection?.(),range=document.createRange?.();if(selection&&range){range.selectNodeContents(editor);range.collapse(true);selection.removeAllRanges();selection.addRange(range);}return true;}catch{return false;}
  }
  function preview(message){
    const target=destination(message),permalink=permalinkFor(message);
    if(!target||!permalink){showNotice('Open this message’s conversation or thread so Slack can add its preview.');return false;}
    const {editor,quill}=target;
    if(quill.getLength()+permalink.length>39000||!placeAtStart(editor,quill)){showNotice('This message link does not fit in the current draft.');return false;}
    const history=quill.getModule('history'),before=editor.innerHTML;
    try{
      history?.cutoff?.();let accepted=false;
      try{const data=new DataTransfer();data.setData('text/plain',permalink);data.setData('text/uri-list',permalink);const event=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data,composed:true});editor.dispatchEvent(event);accepted=event.defaultPrevented||editor.innerHTML!==before;}catch{}
      if(!accepted){quill.updateContents({ops:[{insert:permalink+'\n'}]},'user');quill.setSelection(permalink.length+1,0,'user');}
      history?.cutoff?.();editor.focus();return true;
    }catch{showNotice('Slack could not insert this message preview. Check your draft before trying again.');return false;}
  }
  function action(actions,kind,label,path,activate){
    const holder=document.createElement('div');holder.className='c-message_actions__overflow_item c-message_actions__overflow_item--button';holder.dataset[kind]='';
    const button=document.createElement('button');button.type='button';button.className='c-button-unstyled c-icon_button c-icon_button--size_smedium c-message_actions__button c-icon_button--default';button.setAttribute('aria-label',label);button.title=label+(kind==='pmeReplyPreview'?' (Q)':'');if(kind==='pmeReplyPreview')button.setAttribute('aria-keyshortcuts','Q');button.innerHTML=`<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="${path}"/></svg>`;button.addEventListener('mousedown',event=>event.preventDefault());button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();activate(actions.closest(MESSAGE));});holder.append(button);return holder;
  }
  function scrubMenuClone(root){
    for(const node of [root,...root.querySelectorAll?.('*')||[]]){
      node.removeAttribute?.('id');
      for(const attribute of [...node.attributes||[]])if(attribute.name.startsWith('data-'))node.removeAttribute(attribute.name);
    }
  }
  function menuAction(template,kind,label,activate,message){
    const item=template.cloneNode(true);scrubMenuClone(item);item.dataset[kind]='';item.removeAttribute('aria-checked');item.setAttribute('aria-label',label);
    const labelNode=item.querySelector('[data-qa*="label"],.c-menu_item__label,.c-menu_item__text')||item;
    labelNode.textContent=label;
    item.addEventListener('pointerdown',event=>event.preventDefault());
    item.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();activate(message);document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));});
    return item;
  }
  function decorateMenus(){
    const message=Date.now()-overflowTarget.at<2500&&overflowTarget.message?.isConnected?overflowTarget.message:null;
    if(!message)return;
    for(const menu of document.querySelectorAll('[role="menu"]')){
      if(!visible(menu)||menu.querySelector('[data-pme-quote-menu],[data-pme-preview-menu]'))continue;
      const items=[...menu.querySelectorAll('[role="menuitem"],[role="menuitemcheckbox"]')];
      const copy=items.find(item=>/copy\s+(?:message\s+)?link/i.test(`${item.getAttribute('aria-label')||''} ${item.textContent||''}`));
      if(!copy)continue;
      if(settings.quoteAction)copy.before(menuAction(copy,'pmeQuoteMenu','Quote in reply',quote,message));
      if(settings.previewAction)copy.before(menuAction(copy,'pmePreviewMenu','Reply with preview',preview,message));
    }
  }
  function decorate(){
    scheduled=false;if(disposed)return;
    for(const actions of document.querySelectorAll(ACTIONS)){
      const message=actions.closest(MESSAGE);
      if(!message?.querySelector('[data-qa="message-text"]'))continue;
      const more=actions.querySelector('[data-qa="more_message_actions"]')?.closest('.c-message_actions__overflow_item');
      if(settings.quoteAction&&!actions.querySelector('[data-pme-quote-reply]'))actions.insertBefore(action(actions,'pmeQuoteReply','Quote in reply','M3 4h6v6H5c0 2 1 3 3 4l-1 2c-3-1-4-3-4-6V4zm9 0h6v6h-4c0 2 1 3 3 4l-1 2c-3-1-4-3-4-6V4z',quote),more||null);
      if(settings.previewAction&&!actions.querySelector('[data-pme-reply-preview]'))actions.insertBefore(action(actions,'pmeReplyPreview','Reply with preview','M8 4 2.5 9.5 8 15v-3h3.5c2.7 0 4.6 1 6 3.2-.4-5-2.7-8.2-6.8-8.2H8V4Z',preview),more||null);
    }
    decorateMenus();
  }
  function schedule(){if(disposed||scheduled)return;scheduled=true;queueMicrotask(decorate);}
  const style=document.createElement('style');style.id='pme-quote-style';style.textContent=`
    :is([data-pme-quote-reply],[data-pme-reply-preview]) button svg{width:20px;height:20px;pointer-events:none}
    :is([data-pme-quote-reply],[data-pme-reply-preview]) button:focus-visible{outline:2px solid currentColor;outline-offset:-3px}
    body[data-pme-reply-compact-cards] [data-qa="forwarded_message_card"]{max-height:240px;overflow:hidden}
    body[data-pme-reply-compact-cards] [data-qa="forwarded_message_card"] [data-qa="message_attachment_slack_msg_text"]{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
    body[data-pme-reply-compact-cards] [data-qa="forwarded_message_card"] :is(.c-file_gallery,img){max-height:120px!important;object-fit:cover}
    #pme-quote-notice{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:440px;padding:12px 16px;border-radius:9px;background:#202839;color:#f4f5f8;box-shadow:0 4px 20px #0005;font:13px/1.5 system-ui;pointer-events:none}`;
  document.head.append(style);
  const observer=new MutationObserver(records=>{
    if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&!n.hasAttribute('data-pme-quote-reply')&&!n.hasAttribute('data-pme-reply-preview')&&(n.matches(ACTIONS)||n.querySelector(ACTIONS)||n.matches('[role="menu"]')||n.querySelector('[role="menu"]')))))schedule();
  });
  observer.observe(document.body,{childList:true,subtree:true});decorate();
  document.addEventListener('pointerdown',event=>{const more=event.target instanceof Element&&event.target.closest('[data-qa="more_message_actions"]');const message=more?.closest(MESSAGE);if(message)overflowTarget={message,at:Date.now()};},{signal:abort.signal,capture:true});
  document.addEventListener('pointerover',event=>{const message=event.target instanceof Element&&event.target.closest(MESSAGE);if(message)hovered={message,at:Date.now()};},{signal:abort.signal,capture:true});
  window.addEventListener('keydown',event=>{if(!settings.previewAction||!settings.previewShortcut||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.repeat||event.isComposing||String(event.key).toLowerCase()!=='q')return;const focused=document.activeElement instanceof Element&&document.activeElement.closest('[data-pme-reply-preview]'),message=focused?.closest(MESSAGE)||(Date.now()-hovered.at<3000&&hovered.message?.matches(':hover')?hovered.message:null);if(!message)return;const editable=event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');if(editable&&!focused&&String(editable.innerText||editable.value||'').trim())return;event.preventDefault();event.stopImmediatePropagation();preview(message);},{signal:abort.signal,capture:true});
  window.__PME_QUOTE_REPLY__={version:'0.3.0',configure(value={}){for(const key of booleanKeys)if(typeof value[key]==='boolean')settings[key]=value[key];document.body?.toggleAttribute('data-pme-reply-compact-cards',settings.compactCards);if(!settings.quoteAction)document.querySelectorAll('[data-pme-quote-reply],[data-pme-quote-menu]').forEach(node=>node.remove());if(!settings.previewAction)document.querySelectorAll('[data-pme-reply-preview],[data-pme-preview-menu]').forEach(node=>node.remove());schedule();return {...settings};},dispose(){disposed=true;observer.disconnect();abort.abort();clearTimeout(noticeTimer);style.remove();document.body?.removeAttribute('data-pme-reply-compact-cards');document.querySelectorAll('[data-pme-quote-reply],[data-pme-reply-preview],[data-pme-quote-menu],[data-pme-preview-menu],#pme-quote-notice').forEach(n=>n.remove());delete window.__PME_QUOTE_REPLY__;}};
})();
