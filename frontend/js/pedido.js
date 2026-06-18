const API = 'http://localhost:5000';

const produtos = [
  { id: 1,  nome: "Copo 200ml Econômico",    preco: 10.00 },
  { id: 2,  nome: "Copo 300ml Tradicional",  preco: 15.00 },
  { id: 3,  nome: "Copo 400ml Médio",        preco: 18.00 },
  { id: 4,  nome: "Copo 500ml Grande",       preco: 22.00 },
  { id: 5,  nome: "Copo 700ml Gigante",      preco: 28.00 },
  { id: 6,  nome: "Tigela 500ml Casa",       preco: 24.00 },
  { id: 7,  nome: "Tigela 800ml Família",    preco: 35.00 },
  { id: 8,  nome: "Barca de Açaí P",         preco: 45.00 },
  { id: 9,  nome: "Barca de Açaí G",         preco: 65.00 },
  { id: 10, nome: "Copo Trufado Nutella",    preco: 26.00 },
  { id: 11, nome: "Copo Trufado Ninho",      preco: 26.00 },
  { id: 12, nome: "Açaí Zero Açúcar 400ml",  preco: 21.00 }
];

const complementos = [
  "Leite em Pó", "Granola", "Banana", "Morango", "Nutella", "Paçoca",
  "Leite Condensado", "M&Ms", "Coco Ralado", "Ovomaltine", "Bis", "Kiwi"
];

let carrinho = [];
const MAX_ACOMPANHAMENTOS = 4;

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
  document.getElementById('cart-count').innerText = qtdTotal;
  document.getElementById('cart-total').innerText  = `R$ ${total.toFixed(2)}`;
}

function toggleCart(estado) {
  document.getElementById('cart-sidebar').classList.toggle('active', estado);
}

function abrirModal() {
  if (carrinho.length === 0) return;
  document.getElementById('modal-erro').textContent = '';
  document.getElementById('modal-overlay').classList.add('active');
}

function fecharModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

async function confirmarPedido() {
  const nome   = document.getElementById('input-nome').value.trim();
  const tel    = document.getElementById('input-tel').value.trim();
  const rua    = document.getElementById('input-rua').value.trim();
  const numero = document.getElementById('input-numero').value.trim();
  const bairro = document.getElementById('input-bairro').value.trim();
  const erro   = document.getElementById('modal-erro');

  if (!nome || !tel || !rua || !numero || !bairro) {
    erro.textContent = 'Preencha todos os campos para continuar.';
    return;
  }

  const end   = `${rua}, ${numero} — ${bairro}, Rolante`;
  const total = carrinho.reduce((s, i) => s + i.preco * i.qtd, 0);

  const payload = {
    cliente: { nome, tel, end },
    itens: carrinho.map(i => ({ nome: i.nome, preco: i.preco, extras: i.extras, qtd: i.qtd })),
    total
  };

  try {
    erro.textContent = '';
    const btnEnviar = document.querySelector('.modal .btn-finalizar');
    btnEnviar.disabled    = true;
    btnEnviar.textContent = 'Enviando…';

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
    erro.textContent = 'Erro ao enviar pedido. Verifique a conexão e tente novamente.';
    const btnEnviar = document.querySelector('.modal .btn-finalizar');
    btnEnviar.disabled    = false;
    btnEnviar.textContent = 'Enviar Pedido →';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderVitrine();
  const ids = JSON.parse(localStorage.getItem('pedidoIds') || '[]');
  if (ids.length > 0) {
    const link = document.getElementById('link-acompanhar');
    if (link) link.href = 'acompanhar.html';
  }
});
