const API = 'http://localhost:5000';
const TAXA_ENTREGA = 3.0;

let produtos     = [];
let complementos = [];

let carrinho = [];
const MAX_ACOMPANHAMENTOS = 4;

let pixTxid      = null;
let pixCopiaCola = null;

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
  if (forma === 'pix') gerarPix();
}

async function gerarPix() {
  const qrEl = document.getElementById('pix-qrcode');
  const copiaColaEl = document.getElementById('pix-copia-cola');

  pixTxid      = null;
  pixCopiaCola = null;
  copiaColaEl.value = '';
  qrEl.textContent = 'Gerando QR Code…';

  const subtotal = carrinho.reduce((s, i) => s + i.preco * i.qtd, 0);
  const total    = subtotal + TAXA_ENTREGA;

  try {
    const res  = await fetch(`${API}/pagamentos/pix`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ valor: total })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.erro || `Erro ${res.status}`);

    pixTxid      = data.txid;
    pixCopiaCola = data.copia_cola;

    const qr = qrcode(0, 'M');
    qr.addData(pixCopiaCola);
    qr.make();
    qrEl.innerHTML = qr.createImgTag(4);
    copiaColaEl.value = pixCopiaCola;

  } catch (e) {
    console.error(e);
    qrEl.textContent = 'Não foi possível gerar o QR Code Pix. Tente novamente.';
  }
}

function copiarPix() {
  if (!pixCopiaCola) return;
  navigator.clipboard.writeText(pixCopiaCola).then(() => {
    const btn = document.querySelector('.btn-copiar');
    const textoOriginal = btn.textContent;
    btn.textContent = 'Copiado!';
    setTimeout(() => { btn.textContent = textoOriginal; }, 2000);
  });
}

function toggleCart(estado) {
  document.getElementById('cart-sidebar').classList.toggle('active', estado);
}

function abrirModal() {
  if (carrinho.length === 0) return;
  document.getElementById('modal-erro').textContent = '';
  document.getElementById('modal-overlay').classList.add('active');
  const formaAtual = document.querySelector('input[name="forma-pagamento"]:checked').value;
  if (formaAtual === 'pix') gerarPix();
}

function fecharModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  pixTxid      = null;
  pixCopiaCola = null;
  document.getElementById('pix-qrcode').textContent = 'Gerando QR Code…';
  document.getElementById('pix-copia-cola').value = '';
}

async function confirmarPedido() {
  const nome   = document.getElementById('input-nome').value.trim();
  const tel    = document.getElementById('input-tel').value.trim();
  const rua    = document.getElementById('input-rua').value.trim();
  const numero = document.getElementById('input-numero').value.trim();
  const bairro = document.getElementById('input-bairro').value.trim();
  const erro   = document.getElementById('modal-erro');
  const formaPagamento = document.querySelector('input[name="forma-pagamento"]:checked').value;

  if (!nome || !tel || !rua || !numero || !bairro) {
    erro.textContent = 'Preencha todos os campos para continuar.';
    return;
  }

  let cartaoDados = null;
  if (formaPagamento === 'cartao') {
    cartaoDados = {
      nome_titular: document.getElementById('input-cartao-nome').value.trim(),
      numero:       document.getElementById('input-cartao-numero').value.trim(),
      validade:     document.getElementById('input-cartao-validade').value.trim(),
      cvv:          document.getElementById('input-cartao-cvv').value.trim(),
    };
    if (!cartaoDados.nome_titular || !cartaoDados.numero || !cartaoDados.validade || !cartaoDados.cvv) {
      erro.textContent = 'Preencha todos os dados do cartão.';
      return;
    }
  }

  if (formaPagamento === 'pix' && !pixTxid) {
    erro.textContent = 'Aguarde o QR Code Pix ser gerado.';
    return;
  }

  const end     = `${rua}, ${numero} — ${bairro}, Rolante`;
  const subtotal = carrinho.reduce((s, i) => s + i.preco * i.qtd, 0);
  const total    = subtotal + TAXA_ENTREGA;

  const btnEnviar = document.querySelector('.modal .btn-finalizar');

  try {
    erro.textContent = '';
    btnEnviar.disabled    = true;
    btnEnviar.textContent = 'Enviando…';

    let pagamentoToken = null;
    if (formaPagamento === 'cartao') {
      const resCartao = await fetch(`${API}/pagamentos/cartao`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(cartaoDados)
      });
      const dataCartao = await resCartao.json();
      if (!resCartao.ok) throw new Error(dataCartao.erro || `Erro ${resCartao.status}`);
      pagamentoToken = dataCartao.token;
    }

    const payload = {
      cliente: { nome, tel, end },
      itens: carrinho.map(i => ({ nome: i.nome, preco: i.preco, extras: i.extras, qtd: i.qtd })),
      total,
      forma_pagamento: formaPagamento,
      ...(pagamentoToken ? { pagamento_token: pagamentoToken } : {}),
      ...(formaPagamento === 'pix' ? { pagamento_referencia: pixTxid } : {})
    };

    const res  = await fetch(`${API}/pedidos`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`Erro ${res.status}`);

    const data = await res.json();
    const ids = JSON.parse(localStorage.getItem('pedidoIds') || '[]');
    if (!ids.includes(String(data.id))) ids.push(String(data.id));
    localStorage.setItem('pedidoIds', JSON.stringify(ids));
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
    const [resProd, resComp] = await Promise.all([
      fetch(`${API}/cardapio`),
      fetch(`${API}/complementos`),
    ]);
    produtos     = await resProd.json();
    const comps  = await resComp.json();
    complementos = comps.map(c => c.nome);
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
