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
 const ratingGroup=form.querySelector('.cc-review-rating');
 const ratingHint=document.getElementById('cc-review-rating-hint');
 const ratingInputs=[...form.querySelectorAll('input[name="rating"]')];
 const submitButton=form.querySelector('[type="submit"]');
 function validateRating(){
   const chosen=form.querySelector('input[name="rating"]:checked');
   if(chosen){
     ratingGroup.classList.remove('cc-review-rating-error');
     ratingGroup.removeAttribute('aria-invalid');
     ratingHint.textContent='Escolha sua nota antes de enviar.';
     return chosen;
   }
   ratingGroup.classList.add('cc-review-rating-error');
   ratingGroup.setAttribute('aria-invalid','true');
   ratingHint.textContent='Selecione de 1 a 5 estrelas para enviar sua avaliação.';
   feedback.textContent='A classificação por estrelas é obrigatória.';
   ratingGroup.scrollIntoView({block:'center',behavior:'auto'});
   ratingInputs[0].focus({preventScroll:true});
   return null;
 }
 ratingInputs.forEach(input=>input.addEventListener('change',()=>{
   ratingGroup.classList.remove('cc-review-rating-error');
   ratingGroup.removeAttribute('aria-invalid');
   ratingHint.textContent='Nota selecionada: '+input.value+' de 5 estrelas.';
   if(feedback.textContent==='A classificação por estrelas é obrigatória.')feedback.textContent='';
 }));
 // A validação nativa impede o evento submit em grupos radio obrigatórios.
 // Interceptar invalid garante que o aviso personalizado apareça mesmo assim.
 form.addEventListener('invalid',event=>{
   if(event.target.name==='rating'){
     event.preventDefault();
     validateRating();
   }
 },true);
 submitButton.addEventListener('click',event=>{
   if(!form.querySelector('input[name="rating"]:checked')){
     event.preventDefault();
     validateRating();
   }
 });
 form.addEventListener('submit',async event=>{
   event.preventDefault();
   const chosen=validateRating();
   if(!chosen)return;
   const token=window.turnstile&&widget!==null?window.turnstile.getResponse(widget):'';
   if(!token){feedback.textContent='Conclua a verificação de segurança.';return}
   const fd=new FormData(form);
   submitButton.disabled=true;
   feedback.textContent='Enviando sua avaliação...';
   try{
     const r=await fetch(API,{
       method:'POST',
       headers:{'Content-Type':'application/json'},
       body:JSON.stringify({
         rating:Number(chosen.value),
         comment:String(fd.get('comment')||''),
         displayName:String(fd.get('displayName')||''),
         turnstileToken:token
       })
     });
     if(!r.ok)throw Error(r.status);
     form.reset();
     ratingHint.textContent='Escolha sua nota antes de enviar.';
     feedback.textContent='Muito obrigada! Sua avaliação foi recebida e aparecerá aqui após aprovação.';
   }catch{
     feedback.textContent='Não foi possível enviar agora. Tente novamente.';
   }finally{
     submitButton.disabled=false;
     if(window.turnstile&&widget!==null)window.turnstile.reset(widget);
   }
 });
})();
