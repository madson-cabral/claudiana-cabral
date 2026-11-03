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

window.addEventListener('resize', () => {
  activeDialogs.forEach((dialog) => fitDialogToSite(dialog));
});

const orderForm = document.getElementById('mulher-ensinavel-order-form');
if (orderForm) {
  const cpfInput = orderForm.elements.namedItem('cpf');
  const cepInput = orderForm.elements.namedItem('cep');
  const ufInput = orderForm.elements.namedItem('uf');
  const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

  const isValidCpf = (value) => {
    const digits = onlyDigits(value);
    if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
    const checkDigit = (length) => {
      let sum = 0;
      for (let i = 0; i < length; i += 1) sum += Number(digits[i]) * (length + 1 - i);
      const remainder = (sum * 10) % 11;
      return remainder === 10 ? 0 : remainder;
    };
    return Number(digits[9]) === checkDigit(9) && Number(digits[10]) === checkDigit(10);
  };

  cpfInput.addEventListener('input', () => cpfInput.setCustomValidity(''));
  cepInput.addEventListener('input', () => cepInput.setCustomValidity(''));
  ufInput.addEventListener('input', () => { ufInput.value = ufInput.value.toUpperCase(); });

  orderForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!isValidCpf(cpfInput.value)) {
      cpfInput.setCustomValidity('Informe um CPF válido para o comprovante.');
      cpfInput.reportValidity();
      return;
    }
    if (onlyDigits(cepInput.value).length !== 8) {
      cepInput.setCustomValidity('Informe um CEP com 8 dígitos.');
      cepInput.reportValidity();
      return;
    }
    const formData = new FormData(orderForm);
    const field = (name) => String(formData.get(name) || '').trim();
    const linhas = [
      'Olá! Quero fazer um pedido do livro *Mulher Ensinável*.',
      '',
      '*Preço unitário:* R$ 50,00',
      `*Total (${field('quantidade')} unidade(s)):* ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(field('quantidade')) * 50)}`,
      '*Promoção:* frete grátis',
      '*Dados da compradora*',
      `*Nome:* ${field('nome')}`,
      `*CPF para comprovante:* ${field('cpf')}`,
      `*WhatsApp:* ${field('telefone')}`,
    ];
    if (field('email')) linhas.push(`*E-mail:* ${field('email')}`);
    linhas.push('', '*Endereço de entrega*',
      `*CEP:* ${field('cep')}`,
      `*Estado:* ${field('uf').toUpperCase()}`,
      `*Cidade:* ${field('cidade')}`,
      `*Bairro:* ${field('bairro')}`,
      `*Logradouro:* ${field('logradouro')}`,
      `*Número:* ${field('numero')}`
    );
    if (field('complemento')) linhas.push(`*Complemento:* ${field('complemento')}`);
    if (field('destinatario')) linhas.push(`*Destinatário:* ${field('destinatario')}`);
    if (field('referencia')) linhas.push(`*Referência:* ${field('referencia')}`);
    linhas.push('', `*Quantidade:* ${field('quantidade')}`);
    if (field('observacoes')) linhas.push(`*Observações:* ${field('observacoes')}`);
    linhas.push('', 'Aguardo as orientações de pagamento para concluir a compra.');
    const url = `https://wa.me/5563999777599?text=${encodeURIComponent(linhas.join('\n'))}`;
    window.open(url, '_blank', 'noopener');
    const paymentStep = document.getElementById('asaas-payment-step');
    const payLink = document.getElementById('asaas-payment-link');
    if (paymentStep && payLink) {
      const oneBook = Number(field('quantidade')) === 1;
      paymentStep.hidden = false;
      payLink.hidden = !oneBook;
      payLink.style.display = oneBook ? 'inline-flex' : 'none';
      paymentStep.querySelector('p').textContent = oneBook
        ? 'Depois de enviar os dados de entrega pelo WhatsApp, conclua o pagamento de 1 exemplar (R$ 50,00) pelo Asaas. O pedido só estará confirmado após a verificação do pagamento.'
        : 'Para mais de 1 exemplar, não utilize o link fixo de R$ 50,00. Solicite pelo WhatsApp um link com o valor total correto.';
      paymentStep.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}
