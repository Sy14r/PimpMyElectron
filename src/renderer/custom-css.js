(()=>{
  'use strict';
  if(window.__PME_CUSTOM_CSS__||location.origin!=='https://app.slack.com')return;
  const STYLE_ID='pme-custom-css-style',limit=8000;let css='',disposed=false;
  function sanitize(value){
    if(typeof value!=='string'||value.length>limit)throw Error('Custom CSS exceeds its 8,000-character limit.');
    if(/[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))throw Error('Custom CSS contains unsupported control characters.');
    const inspected=value.replace(/\/\*[\s\S]*?\*\//g,'').toLowerCase();
    if(/\\|@import\b|\burl\s*\(|(?:-webkit-)?image(?:-set)?\s*\(|(?:-webkit-)?cross-fade\s*\(|\bsrc\s*\(|(?:https?|ftp|file|data|blob):|\bexpression\s*\(|\bbehavior\s*:|-moz-binding|<\/?style|data-pme-|#pme-/.test(inspected))throw Error('Custom CSS contains blocked syntax.');
    return value.trim();
  }
  function render(){let style=document.getElementById(STYLE_ID);if(!style){style=document.createElement('style');style.id=STYLE_ID;(document.head||document.documentElement).append(style);}style.textContent=css;}
  function configure(value={}){if(disposed)return {active:false,length:0};if(typeof value.css==='string')css=sanitize(value.css);render();return {active:!!css,length:css.length};}
  function dispose(){if(disposed)return;disposed=true;document.getElementById(STYLE_ID)?.remove();css='';delete window.__PME_CUSTOM_CSS__;}
  window.__PME_CUSTOM_CSS__={version:'0.1.0',configure,status:()=>({active:!!css,length:css.length}),dispose};render();
})();
