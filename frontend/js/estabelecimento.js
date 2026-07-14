
const API = 'http://localhost:5000';

const ORDEM  = ['aguardando', 'confirmado', 'a_caminho', 'entregue'];
const LABELS = {
  aguardando: '🕐 Aguardando',
  confirmado: '✅ Confirmado',
  a_caminho:  '🛵 A Caminho',
  entregue:   '🎉 Entregue',
};

function formatarPagamento(pedido) {
  if (pedido.forma_pagamento === 'cartao') {
    return `Cartão •••• ${pedido.cartao_ultimos4 || '----'} (${pedido.cartao_bandeira || 'Outro'})`;
  }
  return 'Pix';
}

// ── BUSCA TODOS OS PEDIDOS ────────────────────────────────────
async function fetchPedidos() {
  try {
    const res = await fetch(`${API}/pedidos`);
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    return await res.json();   // espera array de pedidos
  } catch (e) {
    console.error('Erro ao buscar pedidos:', e);
    return null;
  }
}

// ── AVANÇA STATUS ─────────────────────────────────────────────
async function avancarStatus(id) {
  try {
    const res = await fetch(`${API}/pedidos/${id}/status`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    render();
  } catch (e) {
    console.error('Erro ao avançar status:', e);
    alert('Não foi possível atualizar o status. Tente novamente.');
  }
}

// ── LIMPAR ENTREGUES ──────────────────────────────────────────
async function limparEntregues() {
  try {
    const res = await fetch(`${API}/pedidos/entregues`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    render();
  } catch (e) {
    console.error('Erro ao limpar entregues:', e);
    alert('Não foi possível limpar os pedidos entregues.');
  }
}

// ── RENDERIZAÇÃO ──────────────────────────────────────────────
async function render() {
  const pedidos = await fetchPedidos();
  const el      = document.getElementById('lista-pedidos');

  // Erro de conexão com a API
  if (pedidos === null) {
    el.innerHTML = `
      <div class="sem-pedidos">
        <h2>⚠️ Erro de conexão</h2>
        <p>Não foi possível conectar ao servidor. Verifique se o Flask está rodando.</p>
      </div>`;
    return;
  }

  if (pedidos.length === 0) {
    el.innerHTML = `
      <div class="sem-pedidos">
        <h2>Nenhum pedido ainda</h2>
        <p>Os pedidos dos clientes aparecerão aqui automaticamente.</p>
      </div>`;
    return;
  }

  // Mais recentes primeiro, entregues por último
  const ordenados = [...pedidos].sort((a, b) => {
    if (a.status === 'entregue' && b.status !== 'entregue') return  1;
    if (b.status === 'entregue' && a.status !== 'entregue') return -1;
    return b.id - a.id;
  });

  el.innerHTML = ordenados.map(p => {
    const idx         = ORDEM.indexOf(p.status);
    const podeAvancar = idx < ORDEM.length - 1;

    const itensHTML = p.itens.map(item => `
      <div class="item-row">
        <div>
          <div>${item.qtd}× ${item.nome}</div>
          ${item.extras && item.extras.length
            ? `<div class="item-extras">${item.extras.join(', ')}</div>`
            : ''}
        </div>
        <div>R$ ${(item.preco * item.qtd).toFixed(2)}</div>
      </div>`).join('');

    const proximoLabel = {
      aguardando: '✅ Confirmar Pedido',
      confirmado: '🛵 Marcar a Caminho',
      a_caminho:  '🎉 Marcar como Entregue',
      entregue:   'Entregue',
    }[p.status];

    const proximoClass = {
      aguardando: 'btn-confirmar',
      confirmado: 'btn-caminho',
      a_caminho:  'btn-entregue',
      entregue:   'btn-entregue',
    }[p.status];

    // Exibe apenas os últimos 5 dígitos do ID para leitura rápida
    const idCurto = String(p.id).slice(-5);

    return `
      <div class="pedido-card ${p.status}">
        <div class="pedido-topo">
          <h2>Pedido #${idCurto} — ${p.hora}</h2>
          <span class="badge ${p.status}">${LABELS[p.status]}</span>
        </div>

        <div class="pedido-info">
          <strong>👤 ${p.cliente.nome}</strong><br>
          📞 ${p.cliente.tel}<br>
          🏠 ${p.cliente.end}
        </div>

        <div class="itens-lista">
          ${itensHTML}
          <div class="item-row">
            <span>Taxa de entrega</span>
            <span>R$ ${Number(p.taxa_entrega || 0).toFixed(2)}</span>
          </div>
          <div class="item-row">
            <span>Pagamento</span>
            <span>${formatarPagamento(p)}</span>
          </div>
          <div class="total-row">
            <span>Total</span>
            <span>R$ ${Number(p.total).toFixed(2)}</span>
          </div>
        </div>

        <div class="acoes">
          <button
            class="btn-acao ${proximoClass}"
            onclick="avancarStatus(${p.id})"
            ${!podeAvancar ? 'disabled' : ''}>
            ${proximoLabel}
          </button>
        </div>
      </div>`;
  }).join('');
}

// Atualiza a cada 5 segundos para pegar novos pedidos
render();
setInterval(render, 5000);
