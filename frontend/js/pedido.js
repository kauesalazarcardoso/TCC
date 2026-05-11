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

function renderVitrine() {
  document.getElementById('produtos-grid').innerHTML = produtos.map(p => `
    <div class="card">
      <h3>${p.nome}</h3>
      <span class="preco">R$ ${p.preco.toFixed(2)}</span>
      <div class="opcoes-container">
        ${complementos.map(comp =>
          `<label class="opcao-item">
             <input type="checkbox" class="check-${p.id}" value="${comp}"> ${comp}
           </label>`
        ).join('')}
      </div>
      <button class="btn-add-vitrine" onclick="addToCart(${p.id})">Adicionar</button>
    </div>
  `).join('');
}

function addToCart(id) {
  const prod = produtos.find(p => p.id === id);
  const selected = Array.from(document.querySelectorAll(`.check-${id}:checked`)).map(c => c.value);
  const itemKey = prod.nome + ':' + selected.sort().join(',');

  const existente = carrinho.find(i => i.key === itemKey);
  if (existente) {
    existente.qtd++;
  } else {
    carrinho.push({ key: itemKey, nome: prod.nome, preco: prod.preco, extras: selected, qtd: 1 });
  }

  document.querySelectorAll(`.check-${id}`).forEach(c => c.checked = false);
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
    total     += item.preco * item.qtd;
    qtdTotal  += item.qtd;
    return `
      <div class="cart-item">
        <h4>${item.nome}</h4>
        <p style="font-size:0.8rem; color:#666; margin:0">${item.extras.join(', ') || 'Puro'}</p>
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

function enviarPedido() {
  if (carrinho.length === 0) return;
  carrinho = [];
  updateUI();
  toggleCart(false);
}

document.addEventListener('DOMContentLoaded', renderVitrine);
