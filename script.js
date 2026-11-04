document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', () => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) target.setAttribute('tabindex', '-1');
  });
});

document.querySelectorAll('details').forEach((item) => {
  item.addEventListener('toggle', () => {
    if (item.open) {
      document.querySelectorAll('details[open]').forEach((other) => {
        if (other !== item) other.removeAttribute('open');
      });
    }
  });
});

const portraitSite = document.querySelector('.portrait-site');
const activeDialogs = new Set();

function fitDialogToSite(dialog) {
  if (!dialog || !portraitSite) return;
  const rect = portraitSite.getBoundingClientRect();
  const gutter = window.innerWidth <= 480 ? 10 : 14;
  const widthCap = dialog.classList.contains('order-dialog') ? 700 : 660;
  const width = Math.max(280, Math.min(rect.width - gutter * 2, widthCap));
  const left = Math.round(rect.left + ((rect.width - width) / 2));

  dialog.style.position = 'fixed';
  dialog.style.margin = '0';
  dialog.style.width = `${width}px`;
  dialog.style.maxWidth = `${width}px`;
  dialog.style.left = `${Math.max(gutter, left)}px`;
  dialog.style.top = `${Math.max(12, Math.round(window.innerHeight * 0.05))}px`;
  dialog.style.maxHeight = `${window.innerHeight - 24}px`;
}

function setupDialog(dialogId, openSelector, closeSelector) {
  const dialog = document.getElementById(dialogId);
  const opener = document.querySelector(openSelector);
  if (!dialog || !opener) return;

  opener.addEventListener('click', () => {
    fitDialogToSite(dialog);
    dialog.showModal();
    activeDialogs.add(dialog);
    requestAnimationFrame(() => fitDialogToSite(dialog));
  });

  dialog.querySelectorAll(closeSelector).forEach((button) => {
    button.addEventListener('click', () => dialog.close());
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => {
    activeDialogs.delete(dialog);
    opener.focus();
  });
}

setupDialog('livro-sinopse-dialog', '[data-open-synopsis]', '[data-close-synopsis]');
setupDialog('mulher-ensinavel-sinopse-dialog', '[data-open-mulher-synopsis]', '[data-close-mulher-synopsis]');
setupDialog('mulher-ensinavel-pedido-dialog', '[data-open-order]', '[data-close-order]');
setupDialog('uiclap-cadastro-dialog', '[data-open-uiclap]', '[data-close-uiclap]');

window.addEventListener('resize', () => {
  activeDialogs.forEach((dialog) => fitDialogToSite(dialog));
});

// Checkout de produção: valores e estoque definidos exclusivamente pelo servidor.
const ORDER_ENDPOINT = 'https://claudiana-orders-api.madsoncabral59.workers.dev/api/store/checkout';
const TURNSTILE_SITE_KEY = '0x4AAAAAAFy6n_bdBUXT_DEq';
const orderForm = document.getElementById('mulher-ensinavel-order-form');
let turnstileScriptPromise;
let turnstileWidgetId = null;
let submittingOrder = false;

function ensureTurnstileScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile_unavailable'));
      script.onerror = () => reject(new Error('turnstile_unavailable'));
      document.head.appendChild(script);
    }).catch((error) => { turnstileScriptPromise = null; throw error; });
  }
  return turnstileScriptPromise;
}

async function initializeOrderTurnstile() {
  const container = document.getElementById('order-turnstile');
  const feedback = document.getElementById('order-flow-feedback');
  if (!container) return;
  try {
    const turnstile = await ensureTurnstileScript();
    if (turnstileWidgetId === null) {
      turnstileWidgetId = turnstile.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'light',
        'expired-callback': () => {
          if (feedback) { feedback.hidden = false; feedback.textContent = 'Verificação expirada. Confirme novamente antes de pagar.'; }
        }
      });
    } else {
      turnstile.reset(turnstileWidgetId);
    }
  } catch {
    if (feedback) { feedback.hidden = false; feedback.textContent = 'Não foi possível carregar a verificação de segurança. Atualize a página e tente novamente.'; }
  }
}

if (orderForm) {
  const cepInput = orderForm.elements.namedItem('cep');
  const ufInput = orderForm.elements.namedItem('uf');
  const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
  cepInput.addEventListener('input', () => cepInput.setCustomValidity(''));
  ufInput.addEventListener('input', () => { ufInput.value = ufInput.value.toUpperCase(); });

  orderForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submittingOrder) return;
    const feedback = document.getElementById('order-flow-feedback');
    const submit = orderForm.querySelector('button[type="submit"]');
    const show = (message) => {
      if (feedback) { feedback.textContent = message; feedback.hidden = false; }
    };
    if (onlyDigits(cepInput.value).length !== 8) {
      cepInput.setCustomValidity('Informe um CEP com 8 dígitos.');
      cepInput.reportValidity();
      return;
    }
    const token = window.turnstile && turnstileWidgetId !== null
      ? window.turnstile.getResponse(turnstileWidgetId) : '';
    if (!token) {
      show('Conclua a verificação de segurança antes de continuar.');
      return;
    }
    const formData = new FormData(orderForm);
    const field = (key) => String(formData.get(key) || '').trim();
    const quantity = Number(field('quantidade'));
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) {
      show('Informe uma quantidade de 1 a 10 exemplares.');
      return;
    }
    const payload = {
      name: field('nome'),
      phone: onlyDigits(field('telefone')),
      email: field('email'),
      quantity,
      consent: formData.get('consentimento') !== null,
      turnstileToken: token,
      address: {
        postalCode: onlyDigits(field('cep')),
        state: field('uf').toUpperCase(),
        city: field('cidade'),
        neighborhood: field('bairro'),
        street: field('logradouro'),
        number: field('numero'),
        complement: field('complemento'),
        recipient: field('destinatario'),
        reference: field('referencia')
      }
    };
    submittingOrder = true;
    if (submit) { submit.disabled = true; submit.textContent = 'Preparando pagamento seguro...'; }
    show('Preparando seu pedido e o pagamento seguro pelo Asaas...');
    try {
      const response = await fetch(ORDER_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const messages = {
          checkout_not_enabled: 'Os pagamentos online ainda não estão disponíveis. Tente novamente mais tarde.',
          product_unavailable: 'Não há estoque disponível para esta quantidade no momento.',
          verification_failed: 'A verificação de segurança expirou ou não foi aceita. Confirme novamente.',
          invalid_order_data: 'Confira seus dados de contato e endereço e tente novamente.',
          checkout_creation_pending_review: 'Não foi possível confirmar a criação do pagamento. Não envie outro pedido agora; fale com a equipe para verificar.',
          checkout_link_pending_review: 'Seu pedido precisa de conferência antes do pagamento. Não envie outro pedido agora; fale com a equipe.'
        };
        show(messages[result.error] || 'Não foi possível preparar o pagamento agora. Tente novamente mais tarde.');
        return;
      }
      const redirect = new URL(result.checkoutUrl || '', window.location.href);
      if (redirect.origin !== 'https://asaas.com' || redirect.pathname !== '/checkoutSession/show' || !redirect.searchParams.get('id')) {
        show('O link de pagamento retornou um formato inesperado. Entre em contato com a equipe.');
        return;
      }
      show('Pedido criado. Redirecionando para o pagamento seguro...');
      window.location.assign(redirect.toString());
    } catch {
      show('Não foi possível verificar a criação do pedido. Antes de tentar novamente, entre em contato com a equipe para evitar duplicidade.');
    } finally {
      submittingOrder = false;
      if (submit) { submit.disabled = false; submit.textContent = 'Continuar para pagamento seguro'; }
      if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
    }
  });
}

// O modal é criado pela interface existente; o desafio só inicia quando ele é aberto.
const orderDialog = document.getElementById('mulher-ensinavel-pedido-dialog');
if (orderDialog) {
  const originalShowModal = orderDialog.showModal.bind(orderDialog);
  orderDialog.showModal = function () {
    originalShowModal();
    initializeOrderTurnstile();
  };
}

// Cadastro de interesse UICLAP: desativado em producao ate publicacao do endpoint no Worker.
const UICLAP_INTENT_ENDPOINT = 'https://claudiana-orders-api.madsoncabral59.workers.dev/api/store/uiclap-intents';
const UICLAP_STORE_URL = 'https://loja.uiclap.com/titulo/ua219240';
const uiclapForm = document.getElementById('uiclap-cadastro-form');
let uiclapTurnstileId = null;
let uiclapSubmitting = false;
const uiclapDialog = document.getElementById('uiclap-cadastro-dialog');
if (uiclapDialog) {
  const originalUiclapShow = uiclapDialog.showModal.bind(uiclapDialog);
  uiclapDialog.showModal = function () {
    originalUiclapShow();
    ensureTurnstileScript().then(turnstile => {
      if (uiclapTurnstileId === null) {
        uiclapTurnstileId = turnstile.render('#uiclap-turnstile', {sitekey: TURNSTILE_SITE_KEY, theme: 'light'});
      } else turnstile.reset(uiclapTurnstileId);
    }).catch(() => {
      const status = document.getElementById('uiclap-feedback');
      status.hidden = false;
      status.textContent = 'Não foi possível carregar a verificação. Atualize a página e tente novamente.';
    });
  };
}
if (uiclapForm) {
  const feedback = document.getElementById('uiclap-feedback');
  const button = uiclapForm.querySelector('button[type="submit"]');
  const idempotencyKey = () => window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : null;
  let pendingKey = idempotencyKey();
  uiclapForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (uiclapSubmitting) return;
    const form = new FormData(uiclapForm);
    const field = name => String(form.get(name) || '').trim();
    const phone = field('telefone').replace(/\D/g, '');
    const quantity = Number(field('quantidade'));
    const token = window.turnstile && uiclapTurnstileId !== null ? window.turnstile.getResponse(uiclapTurnstileId) : '';
    const show = message => { feedback.hidden = false; feedback.textContent = message; };
    if (!token) return show('Conclua a verificação de segurança antes de continuar.');
    if (!/^[0-9]{10,15}$/.test(phone) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) return show('Confira o WhatsApp e a quantidade informada.');
    if (!pendingKey) return show('Não foi possível preparar seu cadastro. Atualize a página e tente novamente.');
    uiclapSubmitting = true;
    button.disabled = true;
    button.textContent = 'Registrando...';
    try {
      const response = await fetch(UICLAP_INTENT_ENDPOINT, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({name:field('nome'),phone,email:field('email'),quantity,consent:form.has('consentimento'),turnstileToken:token,idempotencyKey:pendingKey})
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.id || result.storeUrl !== UICLAP_STORE_URL) {
        show('Não foi possível registrar o cadastro. Nenhuma compra foi confirmada. Tente novamente ou fale com a equipe.');
        return;
      }
      pendingKey = idempotencyKey();
      show('Cadastro registrado. Abrindo a loja oficial da UICLAP...');
      window.location.assign(UICLAP_STORE_URL);
    } catch {
      show('Não foi possível confirmar o registro. Antes de tentar novamente, fale com a equipe para evitar duplicidade.');
    } finally {
      uiclapSubmitting = false;
      button.disabled = false;
      button.textContent = 'Cadastrar e ir para a UICLAP';
      if (window.turnstile && uiclapTurnstileId !== null) window.turnstile.reset(uiclapTurnstileId);
    }
  });
}
