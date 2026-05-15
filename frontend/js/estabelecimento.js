const ORDEM  = ['aguardando', 'confirmado', 'a_caminho', 'entregue'];
const LABELS = {
  aguardando: '🕐 Aguardando',
  confirmado: '✅ Confirmado',
  a_caminho:  '🛵 A Caminho',
  entregue:   '🎉 Entregue',
};

function getPedidos() {
  return JSON.parse(localStorage.getItem('acai_pedidos') || '[]');
}

function salvarPedidos(pedidos) {
  localStorage.setItem('acai_pedidos', JSON.stringify(pedidos));
}

function avancarStatus(id) {
  const pedidos = getPedidos();
  const p       = pedidos.find(x => x.id === id);
  if (!p) return;

  const idx = ORDEM.indexOf(p.status);
  if (idx < ORDEM.length - 1) p.status = ORDEM[idx + 1];

  salvarPedidos(pedidos);
  render();
}

function limparEntregues() {
  const pedidos = getPedidos().filter(p => p.status !== 'entregue');
  salvarPedidos(pedidos);
  render();
}

function render() {
  const pedidos = getPedidos();
  const el      = document.getElementById('lista-pedidos');

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
    if (a.status === 'entregue' && b.status !== 'entregue') return 1;
    if (b.status === 'entregue' && a.status !== 'entregue') return -1;
    return b.id - a.id;
  });

  el.innerHTML = ordenados.map(p => {
    const idx           = ORDEM.indexOf(p.status);
    const podeAvancar   = idx < ORDEM.length - 1;

    const itensHTML = p.itens.map(item => `
      <div class="item-row">
        <div>
          <div>${item.qtd}× ${item.nome}</div>
          ${item.extras.length ? `<div class="item-extras">${item.extras.join(', ')}</div>` : ''}
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

    return `
      <div class="pedido-card ${p.status}">
        <div class="pedido-topo">
          <h2>Pedido #${String(p.id).slice(-5)} — ${p.hora}</h2>
          <span class="badge ${p.status}">${LABELS[p.status]}</span>
        </div>

        <div class="pedido-info">
          <strong>👤 ${p.cliente.nome}</strong><br>
          📞 ${p.cliente.tel}<br>
          🏠 ${p.cliente.end}
        </div>

        <div class="itens-lista">
          ${itensHTML}
          <div class="total-row">
            <span>Total</span>
            <span>R$ ${p.total.toFixed(2)}</span>
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

// Atualiza a cada 3 segundos para pegar novos pedidos
render();
setInterval(render, 3000);
