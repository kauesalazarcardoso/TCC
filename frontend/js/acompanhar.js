const API = 'https://acai-express-backend.onrender.com';

const STEPS = [
  { status: 'aguardando', icone: '🕐', titulo: 'Pedido Recebido',   desc: 'Aguardando confirmação do estabelecimento' },
  { status: 'confirmado', icone: '✅', titulo: 'Pedido Confirmado', desc: 'O estabelecimento confirmou seu pedido' },
  { status: 'a_caminho',  icone: '🛵', titulo: 'Pedido a Caminho',  desc: 'Seu açaí está saindo para entrega' },
  { status: 'entregue',   icone: '🎉', titulo: 'Pedido Entregue',   desc: 'Aproveite seu açaí!' },
];

const ORDEM = ['aguardando', 'confirmado', 'a_caminho', 'entregue'];

function getIds() {
  try { return JSON.parse(localStorage.getItem('pedidoIds') || '[]'); }
  catch { return []; }
}

function addId(id) {
  const ids = getIds();
  if (!ids.includes(String(id))) {
    ids.push(String(id));
    localStorage.setItem('pedidoIds', JSON.stringify(ids));
  }
}

function removeId(id) {
  localStorage.setItem('pedidoIds', JSON.stringify(getIds().filter(i => i !== String(id))));
}

const idFromUrl = new URLSearchParams(window.location.search).get('id');
if (idFromUrl) addId(idFromUrl);

async function fetchPedido(id) {
  try {
    const res = await fetch(`${API}/pedidos/${id}`);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

function cardHTML(pedido) {
  if (pedido.status === 'pendente_pagamento') {
    return cardPendentePagamentoHTML(pedido);
  }

  const statusIdx = ORDEM.indexOf(pedido.status);

  const stepsHTML = STEPS.map((s, i) => {
    const cls = i < statusIdx ? 'ativo' : i === statusIdx ? 'atual' : '';
    return `
      <div class="step ${cls}">
        <div class="step-icon">${s.icone}</div>
        <div class="step-texto">
          <h4>${s.titulo}</h4>
          <p>${s.desc}</p>
        </div>
      </div>`;
  }).join('');

  const itensHTML = pedido.itens.map(item => `
    <div class="item-linha">
      <div>
        <div>${item.qtd}× ${item.nome}</div>
        ${item.extras && item.extras.length
          ? `<div class="item-extras">${item.extras.join(', ')}</div>`
          : ''}
      </div>
      <div>R$ ${(item.preco * item.qtd).toFixed(2)}</div>
    </div>`).join('');

  return `
    <div class="pedido-card">
      <h2>Pedido das ${pedido.hora}</h2>
      <div class="dados-cliente">
        <strong>📍 ${pedido.cliente.nome}</strong><br>
        📞 ${pedido.cliente.tel}<br>
        🏠 ${pedido.cliente.end}
      </div>
      <div class="timeline">${stepsHTML}</div>
      <h3 class="itens-titulo">Itens do Pedido</h3>
      ${itensHTML}
      <div class="item-linha">
        <div>Taxa de entrega</div>
        <div>R$ ${Number(pedido.taxa_entrega || 0).toFixed(2)}</div>
      </div>
      <div class="item-linha">
        <div>Pagamento</div>
        <div>${formatarPagamento(pedido)}</div>
      </div>
      <div class="total-linha">
        <span>Total</span>
        <span>R$ ${Number(pedido.total).toFixed(2)}</span>
      </div>
    </div>`;
}

function cardPendentePagamentoHTML(pedido) {
  return `
    <div class="pedido-card">
      <h2>Pedido das ${pedido.hora}</h2>
      <div class="dados-cliente">
        <strong>📍 ${pedido.cliente.nome}</strong><br>
        📞 ${pedido.cliente.tel}<br>
        🏠 ${pedido.cliente.end}
      </div>
      <div class="item-linha">
        <div>🕐 Aguardando confirmação do pagamento via Pix…</div>
      </div>
      ${pedido.pix_qr_base64 ? `
        <div class="pix-qrcode">
          <img src="data:image/png;base64,${pedido.pix_qr_base64}" alt="QR Code Pix">
        </div>
        <div class="cartao-campos-linha">
          <input type="text" readonly value="${pedido.pix_copia_cola || ''}" placeholder="Código Pix copia e cola">
          <button type="button" class="btn-copiar" onclick="copiarCodigoPix(this)">Copiar</button>
        </div>
      ` : ''}
      <div class="total-linha">
        <span>Total</span>
        <span>R$ ${Number(pedido.total).toFixed(2)}</span>
      </div>
    </div>`;
}

function copiarCodigoPix(botao) {
  const input = botao.previousElementSibling;
  if (!input || !input.value) return;
  navigator.clipboard.writeText(input.value).then(() => {
    const original = botao.textContent;
    botao.textContent = 'Copiado!';
    setTimeout(() => { botao.textContent = original; }, 2000);
  });
}

function formatarPagamento(pedido) {
  if (pedido.forma_pagamento === 'cartao') {
    return `Cartão •••• ${pedido.cartao_ultimos4 || '----'} (${pedido.cartao_bandeira || 'Outro'})`;
  }
  if (pedido.forma_pagamento === 'dinheiro') {
    return pedido.troco_para
      ? `Dinheiro (troco para R$ ${Number(pedido.troco_para).toFixed(2)})`
      : 'Dinheiro (sem troco)';
  }
  return 'Pix';
}

async function render() {
  const el  = document.getElementById('conteudo');
  const ids = getIds();

  if (ids.length === 0) {
    el.innerHTML = `
      <div class="sem-pedido">
        <h2>Nenhum pedido encontrado</h2>
        <p>Faça seu pedido primeiro!</p>
        <a class="btn-voltar" href="pedido.html">Fazer Pedido</a>
      </div>`;
    return;
  }

  const resultados = await Promise.all(ids.map(id => fetchPedido(id).then(p => ({ id, p }))));

  resultados.forEach(({ id, p }) => { if (!p) removeId(id); });

  const pedidos = resultados.map(r => r.p).filter(Boolean);

  if (pedidos.length === 0) {
    el.innerHTML = `
      <div class="sem-pedido">
        <h2>Nenhum pedido encontrado</h2>
        <p>Faça seu pedido primeiro!</p>
        <a class="btn-voltar" href="pedido.html">Fazer Pedido</a>
      </div>`;
    return;
  }

  pedidos.forEach(p => { if (p.status === 'entregue') removeId(p.id); });

  el.innerHTML = pedidos.map(cardHTML).join('') +
    `<a class="btn-voltar" href="pedido.html">Fazer Novo Pedido</a>`;

  if (pedidos.every(p => p.status === 'entregue')) clearInterval(intervalo);
}

render();
const intervalo = setInterval(render, 5000);
