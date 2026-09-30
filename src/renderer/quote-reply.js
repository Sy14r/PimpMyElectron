(() => {
  if (window.__PME_QUOTE_REPLY__ || location.origin !== 'https://app.slack.com') return;
  const MESSAGE='[data-qa="message_container"]', ACTIONS='[data-qa="message-actions"]';
  const EDITOR='[data-qa="texty_input"][contenteditable="true"]';
  const THREAD='.p-threads_flexpane';
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
  function decorate(){
    scheduled=false;if(disposed)return;
    for(const actions of document.querySelectorAll(ACTIONS)){
      if(actions.querySelector('[data-pme-quote-reply]'))continue;
      const message=actions.closest(MESSAGE);
      if(!message?.querySelector('[data-qa="message-text"]'))continue;
      const holder=document.createElement('div');holder.className='c-message_actions__overflow_item c-message_actions__overflow_item--button';holder.dataset.pmeQuoteReply='';
      const button=document.createElement('button');button.type='button';
      button.className='c-button-unstyled c-icon_button c-icon_button--size_smedium c-message_actions__button c-icon_button--default';
      button.setAttribute('aria-label','Quote in reply');button.title='Quote in reply';
      // Static icon only. Message content is always inserted as text in Quill.
      button.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M3 4h6v6H5c0 2 1 3 3 4l-1 2c-3-1-4-3-4-6V4zm9 0h6v6h-4c0 2 1 3 3 4l-1 2c-3-1-4-3-4-6V4z"/></svg>';
      button.addEventListener('mousedown',event=>event.preventDefault());
      button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();quote(actions.closest(MESSAGE));});
      holder.append(button);
      const more=actions.querySelector('[data-qa="more_message_actions"]')?.closest('.c-message_actions__overflow_item');
      actions.insertBefore(holder,more||null);
    }
  }
  function schedule(){if(disposed||scheduled)return;scheduled=true;queueMicrotask(decorate);}
  const style=document.createElement('style');style.id='pme-quote-style';style.textContent=`
    [data-pme-quote-reply] button svg{width:20px;height:20px;pointer-events:none}
    [data-pme-quote-reply] button:focus-visible{outline:2px solid currentColor;outline-offset:-3px}
    #pme-quote-notice{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:440px;padding:12px 16px;border-radius:9px;background:#202839;color:#f4f5f8;box-shadow:0 4px 20px #0005;font:13px/1.5 system-ui;pointer-events:none}`;
  document.head.append(style);
  const observer=new MutationObserver(records=>{
    if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&!n.hasAttribute('data-pme-quote-reply')&&(n.matches(ACTIONS)||n.querySelector(ACTIONS)))))schedule();
  });
  observer.observe(document.body,{childList:true,subtree:true});decorate();
  window.__PME_QUOTE_REPLY__={version:'0.1.0',dispose(){disposed=true;observer.disconnect();clearTimeout(noticeTimer);style.remove();document.querySelectorAll('[data-pme-quote-reply],#pme-quote-notice').forEach(n=>n.remove());delete window.__PME_QUOTE_REPLY__;}};
})();
