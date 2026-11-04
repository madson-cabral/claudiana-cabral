(() => {
 'use strict';
 const API='https://claudiana-orders-api.madsoncabral59.workers.dev/api/store/reviews';
 const SITE_KEY='0x4AAAAAAFy6n_bdBUXT_DEq';
 const form=document.getElementById('cc-review-form'),feedback=document.getElementById('cc-review-feedback'),list=document.getElementById('cc-reviews-approved');
 if(!form||!list)return;
 let widget=null,scriptPromise=null;
 function turnstile(){
  if(window.turnstile)return Promise.resolve(window.turnstile);
  if(scriptPromise)return scriptPromise;
  scriptPromise=new Promise((resolve,reject)=>{
   const src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
   const prior=document.querySelector('script[src="'+src+'"]');
   if(!prior){const el=document.createElement('script');el.src=src;el.async=true;el.onload=()=>window.turnstile?resolve(window.turnstile):reject(Error('turnstile'));el.onerror=reject;document.head.append(el)}
   else {let n=0;const poll=()=>{if(window.turnstile)resolve(window.turnstile);else if(++n<60)setTimeout(poll,150);else reject(Error('turnstile'))};poll()}
  });return scriptPromise;
 }
 turnstile().then(t=>{widget=t.render('#cc-review-turnstile',{sitekey:SITE_KEY,theme:'light'})}).catch(()=>{feedback.textContent='A verificação não carregou. Atualize a página antes de enviar.'});
 function card(item){const el=document.createElement('article');el.className='cc-review-card';const grade=document.createElement('div');grade.className='cc-rating';grade.textContent='★'.repeat(item.rating)+'☆'.repeat(5-item.rating);grade.setAttribute('aria-label',item.rating+' de 5 estrelas');el.append(grade);if(item.comment){const p=document.createElement('p');p.textContent=item.comment;el.append(p)}const meta=document.createElement('small');meta.textContent=(item.display_name||'Leitora')+' · '+new Date(item.created_at).toLocaleDateString('pt-BR');el.append(meta);return el;}
 async function load(){try{const r=await fetch(API,{cache:'no-store'});if(!r.ok)throw Error(r.status);const data=await r.json();list.replaceChildren();if(!data.reviews?.length){const p=document.createElement('p');p.className='cc-reviews-empty';p.textContent='Seja uma das primeiras pessoas a compartilhar sua experiência.';list.append(p);return}data.reviews.forEach(v=>list.append(card(v)))}catch{list.textContent='As avaliações não estão disponíveis neste momento.'}}
 load();
 form.addEventListener('submit',async event=>{event.preventDefault();const chosen=form.querySelector('input[name="rating"]:checked'),button=form.querySelector('[type="submit"]');if(!chosen){feedback.textContent='Escolha de 1 a 5 estrelas.';return}const token=window.turnstile&&widget!==null?window.turnstile.getResponse(widget):'';if(!token){feedback.textContent='Conclua a verificação de segurança.';return}const fd=new FormData(form);button.disabled=true;feedback.textContent='Enviando sua avaliação...';try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating:Number(chosen.value),comment:String(fd.get('comment')||''),displayName:String(fd.get('displayName')||''),turnstileToken:token})});if(!r.ok)throw Error(r.status);form.reset();feedback.textContent='Muito obrigada! Sua avaliação foi recebida e aparecerá aqui após aprovação.';}catch{feedback.textContent='Não foi possível enviar agora. Tente novamente.'}finally{button.disabled=false;if(window.turnstile&&widget!==null)window.turnstile.reset(widget)}});
})();