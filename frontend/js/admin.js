const API = 'http://localhost:5000';

let _itensMap = {};

// ── CARDÁPIO ─────────────────────────────────────────────────────

async function carregarCardapio() {
  try {
    const res   = await fetch(`${API}/cardapio`);
    const itens = await res.json();
    _itensMap   = {};
    itens.forEach(i => { _itensMap[i.id] = i; });

    const tbody = document.getElementById('tabela-body');
    if (itens.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#999">Nenhum item no cardápio.</td></tr>';
      return;
    }
    tbody.innerHTML = itens.map(item => `
      <tr>
        <td>${item.id}</td>
        <td>${item.nome}</td>
        <td>R$ ${item.preco.toFixed(2)}</td>
        <td class="acoes-td">
          <button class="btn-editar" data-id="${item.id}">Editar</button>
          <button class="btn-remover" data-id="${item.id}">✕</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    document.getElementById('tabela-body').innerHTML =
      '<tr><td colspan="4" style="text-align:center;color:#e74c3c">Erro ao conectar ao servidor.</td></tr>';
  }
}

document.getElementById('tabela-body').addEventListener('click', e => {
  const btn = e.target;
  const id  = parseInt(btn.dataset.id);
  if (btn.classList.contains('btn-editar')) abrirModal(id);
  if (btn.classList.contains('btn-remover')) removerItem(id);
});

async function adicionarItem() {
  const nome  = document.getElementById('novo-nome').value.trim();
  const preco = parseFloat(document.getElementById('novo-preco').value);
  const erro  = document.getElementById('erro-form');
  if (!nome || isNaN(preco) || preco <= 0) { erro.textContent = 'Preencha nome e preço válidos.'; return; }
  const res = await fetch(`${API}/cardapio`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ nome, preco }),
  });
  if (tratarRespostaAuth(res)) return;
  if (res.ok) {
    erro.textContent = '';
    document.getElementById('novo-nome').value  = '';
    document.getElementById('novo-preco').value = '';
    carregarCardapio();
  } else {
    erro.textContent = (await res.json()).erro || 'Erro ao adicionar.';
  }
}

async function removerItem(id) {
  if (!confirm('Remover este item do cardápio?')) return;
  const res = await fetch(`${API}/cardapio/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (tratarRespostaAuth(res)) return;
  carregarCardapio();
}

function abrirModal(id) {
  const item = _itensMap[id];
  if (!item) return;
  document.getElementById('editar-id').value    = item.id;
  document.getElementById('editar-nome').value  = item.nome;
  document.getElementById('editar-preco').value = item.preco;
  document.getElementById('erro-modal').textContent = '';
  document.getElementById('modal').style.display = 'flex';
}

function fecharModal() {
  document.getElementById('modal').style.display = 'none';
}

async function salvarEdicao() {
  const id    = parseInt(document.getElementById('editar-id').value);
  const nome  = document.getElementById('editar-nome').value.trim();
  const preco = parseFloat(document.getElementById('editar-preco').value);
  const erro  = document.getElementById('erro-modal');
  if (!nome || isNaN(preco) || preco <= 0) { erro.textContent = 'Preencha nome e preço válidos.'; return; }
  const res = await fetch(`${API}/cardapio/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ nome, preco }),
  });
  if (tratarRespostaAuth(res)) return;
  if (res.ok) { fecharModal(); carregarCardapio(); }
  else { erro.textContent = (await res.json()).erro || 'Erro ao salvar.'; }
}

document.getElementById('modal').addEventListener('click', e => {
  if (e.target === document.getElementById('modal')) fecharModal();
});

// ── COMPLEMENTOS ─────────────────────────────────────────────────

async function carregarComplementos() {
  try {
    const res   = await fetch(`${API}/complementos`);
    const itens = await res.json();
    const lista = document.getElementById('lista-complementos');
    if (itens.length === 0) {
      lista.innerHTML = '<p style="color:#999">Nenhum complemento cadastrado.</p>';
      return;
    }
    lista.innerHTML = itens.map(c => `
      <span class="tag-complemento">
        ${c.nome}
        <button onclick="removerComplemento(${c.id})" title="Remover">✕</button>
      </span>
    `).join('');
  } catch (e) {
    document.getElementById('lista-complementos').innerHTML =
      '<p style="color:#e74c3c">Erro ao conectar ao servidor.</p>';
  }
}

async function adicionarComplemento() {
  const nome = document.getElementById('novo-complemento').value.trim();
  const erro = document.getElementById('erro-complemento');
  if (!nome) { erro.textContent = 'Digite o nome do complemento.'; return; }
  const res = await fetch(`${API}/complementos`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ nome }),
  });
  if (tratarRespostaAuth(res)) return;
  if (res.ok) {
    erro.textContent = '';
    document.getElementById('novo-complemento').value = '';
    carregarComplementos();
  } else {
    erro.textContent = (await res.json()).erro || 'Erro ao adicionar.';
  }
}

async function removerComplemento(id) {
  if (!confirm('Remover este complemento?')) return;
  const res = await fetch(`${API}/complementos/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (tratarRespostaAuth(res)) return;
  carregarComplementos();
}

// ── INIT ─────────────────────────────────────────────────────────
carregarCardapio();
carregarComplementos();
