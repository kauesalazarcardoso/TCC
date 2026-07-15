const API = 'http://localhost:5000';
const TAXA_ENTREGA = 3.0;

let produtos     = [];
let complementos = [];
let mp           = null;

let carrinho = [];
const MAX_ACOMPANHAMENTOS = 4;

let mpOrderId          = null;
let cardBrickController = null;

function limitarAcompanhamentos(produtoId) {
  const checkboxes = document.querySelectorAll(`.check-${produtoId}`);
  const marcados   = Array.from(checkboxes).filter(c => c.checked).length;
  checkboxes.forEach(c => {
    if (!c.checked) c.disabled = marcados >= MAX_ACOMPANHAMENTOS;
  });
  const contador = document.getElementById(`contador-${produtoId}`);
  if (contador) {
    contador.textContent = `${marcados}/${MAX_ACOMPANHAMENTOS} acompanhamentos`;
    contador.style.color = marcados >= MAX_ACOMPANHAMENTOS ? '#e74c3c' : '#888';
  }
}

function renderVitrine() {
  document.getElementById('produtos-grid').innerHTML = produtos.map(p => `
    <div class="card">
      <h3>${p.nome}</h3>
      <span class="preco">R$ ${p.preco.toFixed(2)}</span>
      <div style="font-size:0.78rem;color:#888;margin-bottom:6px">
        Escolha até ${MAX_ACOMPANHAMENTOS} acompanhamentos:
        <span id="contador-${p.id}" style="font-weight:bold;margin-left:4px">
          0/${MAX_ACOMPANHAMENTOS} acompanhamentos
        </span>
      </div>
      <div class="opcoes-container">
        ${complementos.map(comp => `
          <label class="opcao-item">
            <input type="checkbox" class="check-${p.id}" value="${comp}"
              onchange="limitarAcompanhamentos(${p.id})"> ${comp}
          </label>`).join('')}
      </div>
      <button class="btn-add-vitrine" onclick="addToCart(${p.id})">Adicionar</button>
    </div>
  `).join('');
}

function addToCart(id) {
  const prod     = produtos.find(p => p.id === id);
  const selected = Array.from(document.querySelectorAll(`.check-${id}:checked`)).map(c => c.value);
  const itemKey  = prod.nome + ':' + selected.sort().join(',');
  const existente = carrinho.find(i => i.key === itemKey);
  if (existente) {
    existente.qtd++;
  } else {
    carrinho.push({ key: itemKey, nome: prod.nome, preco: prod.preco, extras: selected, qtd: 1 });
  }
  document.querySelectorAll(`.check-${id}`).forEach(c => { c.checked = false; c.disabled = false; });
  limitarAcompanhamentos(id);
  updateUI();
  toggleCart(true);
}

function changeQty(key, delta) {
  const index = carrinho.findIndex(i => i.key === key);
  if (index !== -1) {
    carrinho[index].qtd += delta;
    if (carrinho[index].qtd <= 0) carrinho.splice(index, 1);
  }
  updateUI();
}

function calcularTotal() {
  const subtotal = carrinho.reduce((s, i) => s + i.preco * i.qtd, 0);
  return subtotal + (carrinho.length > 0 ? TAXA_ENTREGA : 0);
}

function updateUI() {
  let total = 0, qtdTotal = 0;
  document.getElementById('cart-list').innerHTML = carrinho.map(item => {
    total    += item.preco * item.qtd;
    qtdTotal += item.qtd;
    return `
      <div class="cart-item">
        <h4>${item.nome}</h4>
        <p style="font-size:0.8rem;color:#666;margin:0">${item.extras.join(', ') || 'Puro'}</p>
        <div class="cart-controls">
          <span style="font-weight:bold">R$ ${(item.preco * item.qtd).toFixed(2)}</span>
          <div class="qty-box">
            <button class="qty-btn" onclick="changeQty('${item.key}', -1)">−</button>
            <span>${item.qtd}</span>
            <button class="qty-btn" onclick="changeQty('${item.key}', 1)">+</button>
          </div>
        </div>
      </div>`;
  }).join('');
  const taxa = qtdTotal > 0 ? TAXA_ENTREGA : 0;
  document.getElementById('cart-count').innerText = qtdTotal;
  document.getElementById('cart-taxa').innerText  = `R$ ${taxa.toFixed(2)}`;
  document.getElementById('cart-total').innerText  = `R$ ${(total + taxa).toFixed(2)}`;
}

function alternarFormaPagamento() {
  const forma = document.querySelector('input[name="forma-pagamento"]:checked').value;
  document.getElementById('cartao-campos').classList.toggle('active', forma === 'cartao');
  document.getElementById('pix-campos').classList.toggle('active', forma === 'pix');
  document.getElementById('btn-enviar-pedido').style.display = forma === 'cartao' ? 'none' : 'block';

  if (forma === 'pix') {
    tentarGerarPixSeEmailValido();
  } else {
    montarCardBrick();
  }
}

function tentarGerarPixSeEmailValido() {
  const formaAtual = document.querySelector('input[name="forma-pagamento"]:checked').value;
  if (formaAtual !== 'pix') return;

  const email = document.getElementById('input-email').value.trim();
  if (!email.includes('@')) {
    mpOrderId = null;
    document.getElementById('pix-qrcode').textContent = 'Preencha seu e-mail acima para gerar o QR Code.';
    document.getElementById('pix-copia-cola').value = '';
    return;
  }
  gerarPix(email);
}

async function gerarPix(email) {
  const qrEl        = document.getElementById('pix-qrcode');
  const copiaColaEl = document.getElementById('pix-copia-cola');

  mpOrderId = null;
  copiaColaEl.value = '';
  qrEl.textContent = 'Gerando QR Code…';

  try {
    const res  = await fetch(`${API}/pagamentos/pix`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ valor: calcularTotal(), email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.erro || `Erro ${res.status}`);

    mpOrderId = data.mp_order_id;
    qrEl.innerHTML = `<img src="data:image/png;base64,${data.qr_code_base64}" alt="QR Code Pix">`;
    copiaColaEl.value = data.qr_code;

  } catch (e) {
    console.error(e);
    qrEl.textContent = 'Não foi possível gerar o QR Code Pix. Tente novamente.';
  }
}

function copiarPix() {
  const copiaColaEl = document.getElementById('pix-copia-cola');
  if (!copiaColaEl.value) return;
  navigator.clipboard.writeText(copiaColaEl.value).then(() => {
    const btn = document.querySelector('.btn-copiar');
    const textoOriginal = btn.textContent;
    btn.textContent = 'Copiado!';
    setTimeout(() => { btn.textContent = textoOriginal; }, 2000);
  });
}

async function montarCardBrick() {
  const container = document.getElementById('cardPaymentBrick_container');

  if (cardBrickController) {
    try { await cardBrickController.unmount(); } catch (e) { /* já desmontado */ }
    cardBrickController = null;
  }
  container.innerHTML = '';

  const bricksBuilder = mp.bricks();
  cardBrickController = await bricksBuilder.create('cardPayment', 'cardPaymentBrick_container', {
    initialization: { amount: calcularTotal() },
    callbacks: {
      onSubmit: (formData) => processarCartao(formData),
      onError: (error) => {
        console.error(error);
        document.getElementById('modal-erro').textContent = 'Erro no formulário de cartão.';
      }
    }
  });
}

function dadosClienteValidos() {
  const nome   = document.getElementById('input-nome').value.trim();
  const tel    = document.getElementById('input-tel').value.trim();
  const email  = document.getElementById('input-email').value.trim();
  const rua    = document.getElementById('input-rua').value.trim();
  const numero = document.getElementById('input-numero').value.trim();
  const bairro = document.getElementById('input-bairro').value.trim();
  return { nome, tel, email, rua, numero, bairro };
}

async function processarCartao(formData) {
  const erro = document.getElementById('modal-erro');
  const { nome, tel, email, rua, numero, bairro } = dadosClienteValidos();

  if (!nome || !tel || !email || !rua || !numero || !bairro) {
    erro.textContent = 'Preencha todos os campos para continuar.';
    throw new Error('Dados do cliente incompletos');
  }
  erro.textContent = '';

  const resCartao = await fetch(`${API}/pagamentos/cartao`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      valor: calcularTotal(),
      email,
      token: formData.token,
      payment_method_id: formData.payment_method_id,
      installments: formData.installments
    })
  });
  const dataCartao = await resCartao.json();
  if (!resCartao.ok) {
    erro.textContent = dataCartao.erro || 'Pagamento recusado.';
    throw new Error(dataCartao.erro || 'Pagamento recusado');
  }

  const end = `${rua}, ${numero} — ${bairro}, Rolante`;
  const payload = {
    cliente: { nome, tel, end },
    itens: carrinho.map(i => ({ nome: i.nome, preco: i.preco, extras: i.extras, qtd: i.qtd })),
    total: calcularTotal(),
    forma_pagamento: 'cartao',
    mp_order_id: dataCartao.mp_order_id
  };

  const res  = await fetch(`${API}/pedidos`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);

  const data = await res.json();
  salvarPedidoLocal(data.id);
  window.location.href = `acompanhar.html?id=${data.id}`;
}

function salvarPedidoLocal(id) {
  const ids = JSON.parse(localStorage.getItem('pedidoIds') || '[]');
  if (!ids.includes(String(id))) ids.push(String(id));
  localStorage.setItem('pedidoIds', JSON.stringify(ids));
}

function toggleCart(estado) {
  document.getElementById('cart-sidebar').classList.toggle('active', estado);
}

function abrirModal() {
  if (carrinho.length === 0) return;
  document.getElementById('modal-erro').textContent = '';
  document.getElementById('modal-overlay').classList.add('active');

  const formaAtual = document.querySelector('input[name="forma-pagamento"]:checked').value;
  document.getElementById('btn-enviar-pedido').style.display = formaAtual === 'cartao' ? 'none' : 'block';

  if (formaAtual === 'cartao') {
    montarCardBrick();
  } else {
    tentarGerarPixSeEmailValido();
  }
}

function fecharModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  mpOrderId = null;
  document.getElementById('pix-qrcode').textContent = 'Preencha seu e-mail acima para gerar o QR Code.';
  document.getElementById('pix-copia-cola').value = '';
  if (cardBrickController) {
    cardBrickController.unmount().catch(() => {});
    cardBrickController = null;
  }
  document.getElementById('cardPaymentBrick_container').innerHTML = '';
}

async function confirmarPedido() {
  const erro = document.getElementById('modal-erro');
  const { nome, tel, email, rua, numero, bairro } = dadosClienteValidos();

  if (!nome || !tel || !email || !rua || !numero || !bairro) {
    erro.textContent = 'Preencha todos os campos para continuar.';
    return;
  }

  if (!mpOrderId) {
    erro.textContent = 'Aguarde o QR Code Pix ser gerado.';
    return;
  }

  const end = `${rua}, ${numero} — ${bairro}, Rolante`;
  const btnEnviar = document.getElementById('btn-enviar-pedido');

  try {
    erro.textContent = '';
    btnEnviar.disabled    = true;
    btnEnviar.textContent = 'Enviando…';

    const payload = {
      cliente: { nome, tel, end },
      itens: carrinho.map(i => ({ nome: i.nome, preco: i.preco, extras: i.extras, qtd: i.qtd })),
      total: calcularTotal(),
      forma_pagamento: 'pix',
      mp_order_id: mpOrderId
    };

    const res  = await fetch(`${API}/pedidos`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`Erro ${res.status}`);

    const data = await res.json();
    salvarPedidoLocal(data.id);
    window.location.href = `acompanhar.html?id=${data.id}`;

  } catch (e) {
    console.error(e);
    erro.textContent = e.message && e.message !== 'Failed to fetch'
      ? e.message
      : 'Erro ao enviar pedido. Verifique a conexão e tente novamente.';
    btnEnviar.disabled    = false;
    btnEnviar.textContent = 'Enviar Pedido →';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [resProd, resComp, resConfig] = await Promise.all([
      fetch(`${API}/cardapio`),
      fetch(`${API}/complementos`),
      fetch(`${API}/config`),
    ]);
    produtos     = await resProd.json();
    const comps  = await resComp.json();
    complementos = comps.map(c => c.nome);
    const config = await resConfig.json();
    mp = new MercadoPago(config.mp_public_key, { locale: 'pt-BR' });
  } catch (e) {
    document.getElementById('produtos-grid').innerHTML =
      '<p style="text-align:center;color:#e74c3c">Erro ao carregar cardápio. Verifique a conexão.</p>';
    return;
  }
  renderVitrine();
  const ids = JSON.parse(localStorage.getItem('pedidoIds') || '[]');
  if (ids.length > 0) {
    const link = document.getElementById('link-acompanhar');
    if (link) link.href = 'acompanhar.html';
  }
});
