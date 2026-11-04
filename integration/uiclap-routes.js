// Adaptador do fluxo UICLAP para integrar ao Worker EXISTENTE (não é um Worker standalone).
// O integrador deve fornecer query(sql, params), método que retorna {rows: Array}.
// As rotas admin DEVEM passar pela verificação JWT Cloudflare Access existente antes deste módulo.
// NÃO inserir tokens ou strings de conexão neste arquivo.
const SKU = '31-DIAS-JORNADA';
const STORE = 'https://loja.uiclap.com/titulo/ua219240';
const table = 'claudiana.uiclap_intents';
const transitions = {
  AWAITING_VERIFICATION: ['PAYMENT_CONFIRMED','NOT_FOUND','CANCELLED'],
  PAYMENT_CONFIRMED: ['AWAITING_SHIPMENT','CANCELLED'],
  AWAITING_SHIPMENT: ['SHIPPED','CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  NOT_FOUND: ['PAYMENT_CONFIRMED','CANCELLED'],
  CANCELLED: []
};
const json = (body, status=200) => new Response(JSON.stringify(body), {
  status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
});
function normalize(input) {return typeof input==='string' ? input.trim() : '';}
function validUuid(value) {return /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);}
function digits(s) {return s.replace(/\D/g,'');}
async function verifyTurnstile(env,token,ip) {
  if (!env.TURNSTILE_SECRET_KEY || !token) return false;
  const body = new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:token});
  if (ip) body.set('remoteip',ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {method:'POST',body,signal:AbortSignal.timeout(8000)});
  if (!response.ok) return false;
  const data = await response.json();
  return data.success === true && (!data.hostname || data.hostname === 'madson-cabral.github.io');
}
// PUBLIC: exige Turnstile válido, allowlist CORS existente, rate-limit por IP no Worker/WAF.
export async function createUiclapIntent(request,env,query) {
  let input; try {input=await request.json();} catch{return json({error:'invalid_json'},400);}
  const name=normalize(input.name), phone=digits(normalize(input.phone)), email=normalize(input.email);
  const quantity=Number(input.quantity), key=normalize(input.idempotencyKey);
  if (name.length<2||name.length>120||!/^\d{10,15}$/.test(phone)||
      (email && (email.length>150||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))||
      !Number.isSafeInteger(quantity)||quantity<1||quantity>10||
      input.consent!==true||!validUuid(key)) return json({error:'invalid_order_data'},400);
  let verified=false;
  try {verified=await verifyTurnstile(env,normalize(input.turnstileToken),request.headers.get('CF-Connecting-IP'));}catch{}
  if (!verified) return json({error:'verification_failed'},403);
  // O retry com a mesma chave é idempotente; dados pessoais nunca são retornados.
  const result=await query(
    `INSERT INTO ${table} (full_name,phone,email,consent_at,quantity,idempotency_key)
     VALUES ($1,$2,$3,now(),$4,$5::uuid)
     ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key=excluded.idempotency_key
     RETURNING id`,[name,phone,email||null,quantity,key]);
  return json({id:result.rows[0].id,storeUrl:STORE},201);
}
// ADMIN: invocar exclusivamente APÓS middleware de autenticação Cloudflare Access.
export async function listUiclapIntents(query) {
  const r=await query(`SELECT id,created_at,updated_at,full_name,phone,email,product_sku,quantity,reference_price_cents,
  status,uiclap_order_ref,tracking_code,carrier,verified_at,shipped_at,delivered_at
  FROM ${table} ORDER BY created_at DESC LIMIT 200`,[]);
  return json({intents:r.rows});
}
// ADMIN: actor deve ser obtido das claims verificadas do JWT, jamais do corpo do request.
export async function updateUiclapStatus(request,query,actor) {
  let body; try {body=await request.json();} catch{return json({error:'invalid_json'},400);}
  const id=normalize(body.id), next=normalize(body.status), reference=normalize(body.uiclapOrderRef);
  const tracking=normalize(body.trackingCode), carrier=normalize(body.carrier);
  if (!validUuid(id)||!Object.hasOwn(transitions,next)||reference.length>120||
    tracking.length>120||carrier.length>100||!actor)return json({error:'invalid_data'},400);
  // A atualizacao e a auditoria ocorrem em uma unica instrucao SQL.
  const result=await query(`WITH changed AS (
    UPDATE ${table}
    SET status=$2, updated_at=now(),
    uiclap_order_ref=CASE WHEN $3<>'' THEN $3 ELSE uiclap_order_ref END,
    tracking_code=CASE WHEN $4<>'' THEN $4 ELSE tracking_code END,
    carrier=CASE WHEN $5<>'' THEN $5 ELSE carrier END,
    verified_at=CASE WHEN $2='PAYMENT_CONFIRMED' THEN now() ELSE verified_at END,
    shipped_at=CASE WHEN $2='SHIPPED' THEN now() ELSE shipped_at END,
    delivered_at=CASE WHEN $2='DELIVERED' THEN now() ELSE delivered_at END,
    verified_by=$6
    WHERE id=$1::uuid AND status=$7 RETURNING id,status
  ), audit AS (
    INSERT INTO claudiana.uiclap_intent_events(intent_id,event_type,actor,details)
    SELECT id,$2,$6,$8::jsonb FROM changed RETURNING intent_id AS id
  ) SELECT changed.id,changed.status FROM changed JOIN audit USING(id)`,
    [id,next,reference,tracking,carrier,actor,current,JSON.stringify({previous:current,reference:reference||undefined})]);
  if (!result.rows.length)return json({error:'conflict_retry'},409);
  return json({intent:result.rows[0]});
}
