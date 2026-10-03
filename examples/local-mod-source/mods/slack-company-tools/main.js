// Package API v1: this is a script body with a local `api` binding.
// This example does not read messages, make requests, or send anything.
const badge=document.createElement('button');
badge.className='pme-company-example';badge.textContent='Company tools';
badge.title='Example mod loaded from a local source';
badge.onclick=()=>{badge.textContent=badge.textContent==='Company tools'?'Local mod is working ✓':'Company tools';};
document.body.append(badge);
api.onCleanup(()=>badge.remove());
