const API = 'http://localhost:5000';

const STEPS = [
  { status: 'aguardando', icone: '🕐', titulo: 'Pedido Recebido',   desc: 'Aguardando confirmação do estabelecimento' },
  { status: 'confirmado', icone: '✅', titulo: 'Pedido Confirmado', desc: 'O estabelecimento confirmou seu pedido' },
  { status: 'a_caminho',  icone: '🛵', titulo: 'Pedido a Caminho',  desc: 'Seu açaí está saindo para entrega' },
  { status: 'entregue',   icone: '🎉', titulo: 'Pedido Entregue',   desc: 'Aproveite seu açaí!' },
];

const ORDEM = ['aguardando', 'confirmado', 'a_caminho', 'entregue'];

// ← lê o ID direto da URL: acompanhar.html?id=123456
const params   = new URLSearchParams(window.location.search);
const pedidoId = params.get('id');

async function fetchPedido() {
  if (!pedidoId) return null;
  try {
    const res = await fetch(`${API}/pedidos/${pedidoId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('Erro ao buscar pedido:', e);
    return null;
  }
}

async function render() {
  const pedido = await fetchPedido();
  const el     = document.getElementById('conteudo');

  if (!pedido) {
    el.innerHTML = `
      <div class="sem-pedido">
        <h2>Nenhum pedido encontrado</h2>
        <p>Faça seu pedido primeiro!</p>
        <a class="btn-voltar" href="pedido.html">Fazer Pedido</a>
      </div>`;
    return;
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

  el.innerHTML = `
    <div class="pedido-card">
      <h2>Acompanhar Pedido</h2>
      <div class="pedido-hora">Pedido feito às ${pedido.hora}</div>
      <div class="dados-cliente">
        <strong>📍 ${pedido.cliente.nome}</strong><br>
        📞 ${pedido.cliente.tel}<br>
        🏠 ${pedido.cliente.end}
      </div>
      <div class="timeline">${stepsHTML}</div>
      <h3 class="itens-titulo">Itens do Pedido</h3>
      ${itensHTML}
      <div class="total-linha">
        <span>Total</span>
        <span>R$ ${Number(pedido.total).toFixed(2)}</span>
      </div>
    </div>
    <a class="btn-voltar" href="pedido.html">Fazer Novo Pedido</a>`;

  if (pedido.status === 'entregue') clearInterval(intervalo);
}

render();
const intervalo = setInterval(render, 5000);
