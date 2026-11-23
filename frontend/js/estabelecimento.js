
const ORDEM  = ['aguardando', 'confirmado', 'a_caminho', 'entregue'];
const LABELS = {
  aguardando: '🕐 Aguardando',
  confirmado: '✅ Confirmado',
  a_caminho:  '🛵 A Caminho',
  entregue:   '🎉 Entregue',
  recusado:   '🚫 Recusado',
};

// ── NOTIFICAÇÃO WHATSAPP (link wa.me, envio é manual) ─────────
// OBS: o link wa.me corrompe emoji no texto pré-preenchido (confirmado em teste
// manual — mesmo emoji simples como ✅ vira "�" na conversa). Por isso as
// mensagens abaixo usam só texto puro, sem emoji.
const MENSAGENS_WHATSAPP = {
  aguardando: (p, id, nome) => `Oi ${nome}! Recebemos seu pedido #${id} na Lovers Açaí. Já vamos confirmar!`,
  confirmado: (p, id, nome) => `Oi ${nome}! Seu pedido #${id} foi *confirmado* e já está sendo preparado!`,
  a_caminho:  (p, id, nome) => `Oi ${nome}! Seu pedido #${id} saiu para entrega. Chega já já!`,
  entregue:   (p, id, nome) => `Oi ${nome}! Seu pedido #${id} foi *entregue*. Bom apetite! Obrigado por pedir na Lovers Açaí.`,
  recusado:   (p, id, nome) => `Oi ${nome}, infelizmente não conseguimos aceitar seu pedido #${id} desta vez. Pedimos desculpas pelo transtorno.`,
};

function normalizarTelefoneBR(tel) {
  const digitos = (tel || '').replace(/\D/g, '');
  if (!digitos) return null;
  return digitos.startsWith('55') ? digitos : `55${digitos}`;
}

function linkWhatsapp(pedido) {
  const gerarMsg = MENSAGENS_WHATSAPP[pedido.status];
  const numero   = normalizarTelefoneBR(pedido.cliente.tel);
  if (!gerarMsg || !numero) return null;

  const idCurto     = String(pedido.id).slice(-5);
  const primeiroNome = (pedido.cliente.nome || '').trim().split(/\s+/)[0] || 'cliente';
  const mensagem    = gerarMsg(pedido, idCurto, primeiroNome);

  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

// ── ALERTA DE PEDIDO NOVO (som + destaque visual + Notification) ──
let audioCtx = null;
let idsConhecidos = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function tocarSomNovoPedido() {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    // Compressor na saída: permite volume alto sem distorcer nos alto-falantes do PC.
    const saida = ctx.createDynamicsCompressor();
    saida.connect(ctx.destination);

    const tocarNota = (freq, inicio, duracao) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      // Onda quadrada soa bem mais alta e "corta" o barulho da loja melhor que a senoidal.
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + inicio);
      gain.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + inicio + 0.01);
      gain.gain.setValueAtTime(0.9, ctx.currentTime + inicio + duracao * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + duracao);
      osc.connect(gain).connect(saida);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + duracao + 0.05);
    };

    // Toque de 3 notas repetido 3 vezes (~2,5 s), pra ninguém deixar passar.
    for (let i = 0; i < 3; i++) {
      const t = i * 0.85;
      tocarNota(988,  t,        0.18);
      tocarNota(1319, t + 0.2,  0.18);
      tocarNota(1568, t + 0.4,  0.3);
    }
  } catch (e) {
    console.error('Erro ao tocar som de notificação:', e);
  }
}

function notificarNovosPedidos(novos) {
  // O aviso quando a aba está em segundo plano ou fechada é responsabilidade
  // do push (Service Worker); aqui só cuidamos do feedback com a aba aberta.
  tocarSomNovoPedido();
}

// ── PUSH NOTIFICATION (funciona com a aba/navegador fechado) ──────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function suportaPush() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function inscricaoAtiva() {
  if (!suportaPush()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

// `inscritoNoServidor` (opcional): false quando a lista de aparelhos mostrou
// que este navegador não está mais cadastrado no servidor (removido por outro
// aparelho); aí o botão volta a oferecer a ativação.
async function atualizarBotaoNotificacao(inscritoNoServidor = true) {
  const btn = document.getElementById('btn-notif');
  if (!btn) return;
  if (!suportaPush()) {
    btn.style.display = 'none';
    return;
  }
  const sub = await inscricaoAtiva();
  if (sub && inscritoNoServidor && Notification.permission === 'granted') {
    btn.textContent = '🔔 Notificações ativadas';
    btn.disabled = true;
  } else {
    btn.textContent = '🔔 Ativar notificações';
    btn.disabled = false;
  }
}

async function ativarNotificacoes() {
  getAudioCtx().resume().catch(() => {});

  if (!suportaPush()) {
    alert('Seu navegador não suporta notificações push.');
    return;
  }
  try {
    const permissao = await Notification.requestPermission();
    if (permissao !== 'granted') return;

    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { vapid_public_key } = await fetch(`${API}/config`).then(r => r.json());
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid_public_key),
      });
    }

    const nome = prompt(
      'Dê um nome para este aparelho (ex.: "PC da loja", "Celular do Kauê"):',
      sugerirNomeAparelho()
    );

    const res = await fetch(`${API}/push/subscribe`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ ...sub.toJSON(), nome: nome || null }),
    });
    if (tratarRespostaAuth(res)) return;
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    if (aparelhosAbertos) renderAparelhos();
  } catch (e) {
    console.error('Erro ao ativar notificações:', e);
    alert('Não foi possível ativar as notificações. Tente novamente.');
  } finally {
    atualizarBotaoNotificacao();
  }
}

// Roda toda vez que o painel abre. Se este navegador tem inscrição local,
// reconfirma ela no servidor (sem mexer no nome). Assim "Notificações
// ativadas" no botão sempre significa que o servidor vai mandar aviso pra cá:
// se a inscrição tinha sido removida de lá, ela volta; se não der pra
// confirmar, o botão volta a mostrar "Ativar notificações".
async function sincronizarInscricao() {
  if (!suportaPush()) return atualizarBotaoNotificacao();
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) reg.update().catch(() => {}); // pega a versão nova do sw.js
    const sub = reg && await reg.pushManager.getSubscription();
    if (!sub || Notification.permission !== 'granted') return atualizarBotaoNotificacao();

    const res = await fetch(`${API}/push/subscribe`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify(sub.toJSON()),
    });
    if (tratarRespostaAuth(res)) return;
    atualizarBotaoNotificacao(res.ok);
  } catch (e) {
    console.error('Erro ao confirmar inscrição de notificações:', e);
    atualizarBotaoNotificacao(false);
  }
}

// ── APARELHOS QUE RECEBEM NOTIFICAÇÃO ─────────────────────────
let aparelhosAbertos = false;

async function testarTodosAparelhos() {
  try {
    const res = await fetch(`${API}/push/dispositivos/teste`, {
      method: 'POST', headers: authHeaders()
    });
    if (tratarRespostaAuth(res)) return;
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    const resultados = await res.json();
    if (resultados.length === 0) {
      alert('Nenhum aparelho está cadastrado para receber notificações.');
    } else {
      const texto = { ok: '✅ enviado', expirada: '❌ não está mais inscrito (removido)', erro: '⚠️ falhou' };
      alert(
        'Resultado do teste:\n\n' +
        resultados.map(r => `${r.nome || 'Sem nome'} (${r.navegador}): ${texto[r.resultado] || r.resultado}`).join('\n') +
        '\n\nConfira se o aviso tocou em cada aparelho marcado como enviado.'
      );
    }
  } catch (e) {
    console.error('Erro ao testar aparelhos:', e);
    alert('Não foi possível enviar o teste.');
  }
  renderAparelhos();
}

function sugerirNomeAparelho() {
  const ua = navigator.userAgent;
  const tipo = /Android|iPhone|iPad|Mobile/i.test(ua) ? 'Celular' : 'Computador';
  const navegador = /Edg\//.test(ua) ? 'Edge'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'navegador';
  return `${tipo} (${navegador})`;
}

// Mesmo hash que o backend calcula (sha256 do endpoint, 16 primeiros
// caracteres), pra marcar na lista qual é "este aparelho" sem que o
// servidor precise devolver o endpoint.
async function idDesteAparelho() {
  try {
    const sub = await inscricaoAtiva();
    if (!sub || !window.crypto || !crypto.subtle) return null;
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sub.endpoint));
    return [...new Uint8Array(bytes)]
      .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  } catch {
    return null;
  }
}

async function fetchAparelhos() {
  try {
    const res = await fetch(`${API}/push/dispositivos`, { headers: authHeaders() });
    if (tratarRespostaAuth(res)) return null;
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('Erro ao buscar aparelhos:', e);
    return null;
  }
}

function toggleAparelhos() {
  aparelhosAbertos = !aparelhosAbertos;
  if (aparelhosAbertos) {
    renderAparelhos();
  } else {
    document.getElementById('secao-aparelhos').innerHTML = '';
  }
}

function _formatarDataHora(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

async function renderAparelhos() {
  const el = document.getElementById('secao-aparelhos');
  const topo = `
    <div class="aparelhos-topo">
      <h2 class="secao-titulo">📱 Aparelhos que recebem notificação</h2>
      <button class="btn-fechar-aparelhos" onclick="toggleAparelhos()" title="Fechar">✕</button>
    </div>
    <p class="aparelhos-ajuda">
      Estes aparelhos recebem o aviso de pedido novo mesmo com o painel fechado.
      Para incluir outro aparelho, abra o painel nele e clique em “🔔 Ativar notificações”.
    </p>
    <button class="btn-acao btn-confirmar btn-testar-todos" onclick="testarTodosAparelhos()">
      🔔 Testar todos os aparelhos
    </button>`;

  if (!el.innerHTML) el.innerHTML = `${topo}<p class="aparelhos-vazio">Carregando...</p>`;

  const [aparelhos, idAtual] = await Promise.all([fetchAparelhos(), idDesteAparelho()]);
  if (!aparelhosAbertos) return; // fechou enquanto carregava

  if (aparelhos === null) {
    el.innerHTML = `${topo}<p class="aparelhos-vazio" style="color:#e74c3c">Erro ao carregar a lista de aparelhos.</p>`;
    return;
  }

  // Se este aparelho foi removido por outro, o botão de ativar volta a aparecer.
  atualizarBotaoNotificacao(aparelhos.some(a => a.aparelho_id === idAtual));

  if (aparelhos.length === 0) {
    el.innerHTML = `${topo}<p class="aparelhos-vazio">Nenhum aparelho está recebendo notificações.</p>`;
    return;
  }

  el.innerHTML = `${topo}${aparelhos.map(a => {
    const atual = a.aparelho_id === idAtual;
    return `
      <div class="aparelho ${atual ? 'atual' : ''}">
        <div>
          <div class="aparelho-nome ${a.nome ? '' : 'sem-nome'}">
            ${a.nome ? escapeHtml(a.nome) : 'Sem nome'}
            ${atual ? '<span class="aparelho-tag">este aparelho</span>' : ''}
          </div>
          <div class="aparelho-detalhe">
            ${escapeHtml(a.navegador)} · ativado em ${escapeHtml(_formatarDataHora(a.criado_em))}
          </div>
        </div>
        <div class="aparelho-acoes">
          <button onclick="testarAparelho(${a.id})">🔔 Testar</button>
          <button onclick="renomearAparelho(${a.id})">✏️ Renomear</button>
          <button class="btn-remover-aparelho" onclick="removerAparelho(${a.id}, ${atual})">🗑️ Remover</button>
        </div>
      </div>`;
  }).join('')}`;
}

async function testarAparelho(id) {
  try {
    const res = await fetch(`${API}/push/dispositivos/${id}/teste`, {
      method: 'POST', headers: authHeaders()
    });
    if (tratarRespostaAuth(res)) return;
    const corpo = await res.json().catch(() => ({}));
    if (res.ok) {
      alert('Notificação de teste enviada! Confira se ela apareceu no aparelho.');
    } else {
      alert(corpo.erro || 'Não foi possível enviar a notificação de teste.');
    }
  } catch (e) {
    console.error('Erro ao testar aparelho:', e);
    alert('Não foi possível enviar a notificação de teste.');
  }
  renderAparelhos();
}

async function renomearAparelho(id) {
  const nome = prompt('Novo nome para o aparelho:');
  if (!nome || !nome.trim()) return;
  try {
    const res = await fetch(`${API}/push/dispositivos/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ nome: nome.trim() }),
    });
    if (tratarRespostaAuth(res)) return;
    if (!res.ok) throw new Error(`Erro ${res.status}`);
  } catch (e) {
    console.error('Erro ao renomear aparelho:', e);
    alert('Não foi possível renomear o aparelho.');
  }
  renderAparelhos();
}

async function removerAparelho(id, ehEsteAparelho) {
  const aviso = ehEsteAparelho
    ? 'Parar de receber notificações NESTE aparelho?'
    : 'Remover este aparelho? Ele deixa de receber os avisos de pedido novo.';
  if (!confirm(aviso)) return;
  try {
    const res = await fetch(`${API}/push/dispositivos/${id}`, {
      method: 'DELETE', headers: authHeaders()
    });
    if (tratarRespostaAuth(res)) return;
    if (!res.ok && res.status !== 404) throw new Error(`Erro ${res.status}`);
    if (ehEsteAparelho) {
      const sub = await inscricaoAtiva();
      if (sub) await sub.unsubscribe().catch(() => {});
    }
  } catch (e) {
    console.error('Erro ao remover aparelho:', e);
    alert('Não foi possível remover o aparelho.');
  }
  renderAparelhos();
  atualizarBotaoNotificacao();
}

// ── BUSCA TODOS OS PEDIDOS ────────────────────────────────────
async function fetchPedidos() {
  try {
    const res = await fetch(`${API}/pedidos`, { headers: authHeaders() });
    if (tratarRespostaAuth(res)) return null;
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
      headers: { 'Content-Type': 'application/json', ...authHeaders() }
    });
    if (tratarRespostaAuth(res)) return;
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    render();
  } catch (e) {
    console.error('Erro ao avançar status:', e);
    alert('Não foi possível atualizar o status. Tente novamente.');
  }
}

// ── VOLTA STATUS (desfaz avanço por engano) ─────────────────────
async function voltarStatus(id) {
  try {
    const res = await fetch(`${API}/pedidos/${id}/status/voltar`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() }
    });
    if (tratarRespostaAuth(res)) return;
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    render();
    if (historicoAberto) renderHistorico();
  } catch (e) {
    console.error('Erro ao voltar status:', e);
    alert('Não foi possível voltar o status. Tente novamente.');
  }
}

// ── NEGAR PEDIDO ───────────────────────────────────────────────
async function negarPedido(id) {
  if (!confirm('Tem certeza que deseja negar este pedido?')) return;
  try {
    const res = await fetch(`${API}/pedidos/${id}/recusar`, {
      method:  'PATCH',
      headers: authHeaders()
    });
    if (tratarRespostaAuth(res)) return;
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    render();
  } catch (e) {
    console.error('Erro ao negar pedido:', e);
    alert('Não foi possível negar o pedido. Tente novamente.');
  }
}

// ── IMPRESSÃO DO PEDIDO (recibo p/ impressora de cupom, via impressão do navegador) ──
let pedidosAtuais = [];

function reciboPedidoHTML(p) {
  const idCurto = String(p.id).slice(-5);

  // Cada item ocupa seu próprio bloco: nome em cima, complementos um por linha
  // e o valor sozinho embaixo, alinhado à direita (não briga por espaço com o nome).
  const itensHTML = p.itens.map(item => `
    <div class="item">
      <div class="item-nome">${item.qtd}x ${escapeHtml(item.nome)}</div>
      ${(item.extras || []).length
        ? `<div class="extras">${item.extras.map(extra => `<div class="extra">+ ${escapeHtml(extra)}</div>`).join('')}</div>`
        : ''}
      <div class="item-valor">R$ ${(item.preco * item.qtd).toFixed(2)}</div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Pedido #${idCurto}</title>
<style>
  @page { margin: 0 2mm; size: 58mm auto; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    width: 48mm;
    margin: 0;
    /* Espaço em branco em cima e embaixo pra separar um pedido do outro no rolo */
    padding: 10mm 0 25mm;
    color: #000;
    word-break: break-word;
  }
  p { margin: 0; }
  /* Se mesmo assim houver quebra de página, não corta um bloco no meio */
  .item, .campo, .obs, .linha, .titulo { break-inside: avoid; page-break-inside: avoid; }
  .titulo { break-after: avoid; page-break-after: avoid; }

  /* Cabeçalho */
  .loja { font-size: 18px; font-weight: bold; text-align: center; }
  .num  { font-size: 24px; font-weight: bold; text-align: center; margin-top: 6px; }
  .hora { font-size: 13px; text-align: center; margin-top: 2px; }

  /* Separação entre seções: linha dupla com bastante respiro */
  .sep { border-top: 2px solid #000; margin: 14px 0; }

  /* Seções */
  .titulo {
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 1px;
    border-bottom: 1px solid #000;
    padding-bottom: 2px;
    margin-bottom: 8px;
  }
  .campo { margin-bottom: 7px; }
  .rotulo { font-size: 11px; font-weight: bold; text-transform: uppercase; }
  .nome-cliente { font-size: 15px; font-weight: bold; }

  .obs {
    border: 2px solid #000;
    padding: 6px;
    margin-top: 10px;
    font-weight: bold;
  }

  /* Itens: separados por linha pontilhada */
  .item { padding: 6px 0 8px; border-bottom: 1px dashed #000; }
  .item:last-child { border-bottom: none; }
  .item-nome { font-weight: bold; font-size: 14px; }
  .extras { margin-top: 3px; }
  .extra { font-size: 12px; padding-left: 8px; margin-bottom: 1px; }
  .item-valor { text-align: right; font-weight: bold; margin-top: 4px; }

  /* Valores */
  .linha { display: flex; justify-content: space-between; gap: 6px; margin-bottom: 5px; }
  .linha span:last-child { white-space: nowrap; }
  .total { font-weight: bold; font-size: 18px; margin-top: 8px; padding-top: 6px; border-top: 1px dashed #000; }

  .rodape { text-align: center; font-size: 12px; }
</style>
</head>
<body>
  <p class="loja">LOVERS AÇAÍ</p>
  <p class="num">PEDIDO #${idCurto}</p>
  <p class="hora">${escapeHtml(p.hora || '')}</p>

  <div class="sep"></div>

  <p class="titulo">CLIENTE</p>
  <div class="campo nome-cliente">${escapeHtml(p.cliente.nome || '')}</div>
  <div class="campo">
    <div class="rotulo">Telefone</div>
    <div>${escapeHtml(p.cliente.tel || '')}</div>
  </div>
  <div class="campo">
    <div class="rotulo">Endereço</div>
    <div>${escapeHtml(p.cliente.end || '')}</div>
  </div>
  ${p.observacao ? `<div class="obs">OBS: ${escapeHtml(p.observacao)}</div>` : ''}

  <div class="sep"></div>

  <p class="titulo">ITENS</p>
  <div class="itens">${itensHTML}</div>

  <div class="sep"></div>

  <p class="titulo">VALORES</p>
  <div class="linha"><span>Entrega</span><span>R$ ${Number(p.taxa_entrega || 0).toFixed(2)}</span></div>
  ${p.taxa_maquininha > 0 ? `<div class="linha"><span>Taxa maquininha</span><span>R$ ${Number(p.taxa_maquininha).toFixed(2)}</span></div>` : ''}
  <div class="linha total"><span>TOTAL</span><span>R$ ${Number(p.total).toFixed(2)}</span></div>

  <div class="sep"></div>

  <p class="titulo">PAGAMENTO</p>
  <div class="campo"><b>${escapeHtml(formatarPagamento(p))}</b></div>

  <div class="sep"></div>
  <p class="rodape">Obrigado pela preferência!</p>
</body>
</html>`;
}

function imprimirPedido(id) {
  const pedido = pedidosAtuais.find(p => p.id === id);
  if (!pedido) return;

  const janela = window.open('', '_blank', 'width=300,height=600');
  if (!janela) {
    alert('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.');
    return;
  }
  janela.document.write(reciboPedidoHTML(pedido));
  janela.document.close();
  janela.onload = () => {
    // O Chrome não entende altura "auto" no @page e usa a altura de papel do
    // driver; se o cupom for maior, o final (ex.: TOTAL) vai pra outra "página".
    // Por isso medimos a altura real do conteúdo e criamos a página desse tamanho.
    const doc = janela.document;
    const alturaPx = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
    const alturaMm = Math.ceil(alturaPx * 25.4 / 96) + 5; // px → mm (+ folga)
    const estilo = doc.createElement('style');
    estilo.textContent = `@page { size: 58mm ${alturaMm}mm; margin: 0 2mm; }`;
    doc.head.appendChild(estilo);

    janela.focus();
    janela.print();
  };
}

// ── LIMPAR ENTREGUES ──────────────────────────────────────────
async function limparEntregues() {
  try {
    const res = await fetch(`${API}/pedidos/entregues`, {
      method:  'DELETE',
      headers: authHeaders()
    });
    if (tratarRespostaAuth(res)) return;
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    render();
  } catch (e) {
    console.error('Erro ao limpar entregues:', e);
    alert('Não foi possível limpar os pedidos entregues.');
  }
}

// ── HISTÓRICO (entregues/recusados dos últimos 7 dias) ────────
let historicoAberto = false;

async function fetchHistorico() {
  try {
    const res = await fetch(`${API}/pedidos/historico`, { headers: authHeaders() });
    if (tratarRespostaAuth(res)) return null;
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('Erro ao buscar histórico:', e);
    return null;
  }
}

async function toggleHistorico() {
  historicoAberto = !historicoAberto;
  const btn         = document.getElementById('btn-historico');
  const el          = document.getElementById('secao-historico');
  const listaPedidos = document.getElementById('lista-pedidos');
  if (historicoAberto) {
    btn.textContent = '📜 Fechar Histórico';
    listaPedidos.style.display = 'none';
    await renderHistorico();
  } else {
    btn.textContent = '📜 Histórico (7 dias)';
    listaPedidos.style.display = '';
    el.innerHTML = '';
  }
}

async function renderHistorico() {
  const el = document.getElementById('secao-historico');
  el.innerHTML = '<p style="text-align:center;color:#999">Carregando...</p>';

  const pedidos = await fetchHistorico();
  if (!historicoAberto) return; // fechou enquanto carregava

  if (pedidos === null) {
    el.innerHTML = '<p style="text-align:center;color:#e74c3c">Erro ao carregar histórico.</p>';
    return;
  }

  const botaoVoltar = `
    <button class="btn-acao btn-voltar" onclick="toggleHistorico()" style="margin-bottom:12px">
      ⬅️ Voltar para a Fila
    </button>`;

  if (pedidos.length === 0) {
    el.innerHTML = `
      ${botaoVoltar}
      <h2 class="secao-titulo">📜 Histórico (últimos 7 dias)</h2>
      <p style="text-align:center;color:#999">Nenhum pedido entregue ou recusado nos últimos 7 dias.</p>`;
    return;
  }

  el.innerHTML = `
    ${botaoVoltar}
    <h2 class="secao-titulo">📜 Histórico (últimos 7 dias)</h2>
    ${pedidos.map(p => {
      const podeVoltar = ORDEM.indexOf(p.status) > 0;
      return `
      <div class="pedido-card ${p.status}">
        <div class="pedido-topo">
          <h2>Pedido #${String(p.id).slice(-5)} — ${p.hora}</h2>
          <span class="badge ${p.status}">${LABELS[p.status]}</span>
        </div>
        <div class="pedido-info">
          <strong>👤 ${escapeHtml(p.cliente.nome)}</strong><br>
          📞 ${escapeHtml(p.cliente.tel)}<br>
          🏠 ${escapeHtml(p.cliente.end)}
        </div>
        <div class="total-row">
          <span>Total</span>
          <span>R$ ${Number(p.total).toFixed(2)}</span>
        </div>
        ${podeVoltar ? `
          <div class="acoes">
            <button class="btn-acao btn-voltar" onclick="voltarStatus(${p.id})" title="Desfazer último avanço de status">
              ↩️ Voltar Status
            </button>
          </div>` : ''}
      </div>`;
    }).join('')}`;
}

// ── HISTÓRICO DE VENDAS (últimos 7 dias) ───────────────────────
async function fetchVendasPorDia() {
  try {
    const res = await fetch(`${API}/pedidos/vendas-por-dia`, { headers: authHeaders() });
    if (tratarRespostaAuth(res)) return null;
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('Erro ao buscar histórico de vendas:', e);
    return null;
  }
}

function _formatarDiaCurto(diaISO) {
  const [ano, mes, dia] = diaISO.split('-');
  return `${dia}/${mes}`;
}

let renderVendasTokenAtual = 0;

async function renderVendasSemana() {
  const meuToken = ++renderVendasTokenAtual;
  const dados = await fetchVendasPorDia();
  if (meuToken !== renderVendasTokenAtual) return;

  const el = document.getElementById('vendas-semana');
  if (!dados) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <h2 class="secao-titulo">📊 Vendas dos últimos 7 dias</h2>
    <div class="vendas-grid">
      ${dados.map(d => `
        <div class="venda-dia">
          <span class="venda-dia-data">${_formatarDiaCurto(d.dia)}</span>
          <span class="venda-dia-total">R$ ${Number(d.total).toFixed(2)}</span>
          <span class="venda-dia-qtd">${d.pedidos} pedido${d.pedidos === 1 ? '' : 's'}</span>
        </div>
      `).join('')}
    </div>`;
}

// ── RENDERIZAÇÃO ──────────────────────────────────────────────
// Guarda "última chamada vence": evita que um GET de polling mais lento
// (ex: backend acordando de um cold start) sobrescreva a tela com dados
// desatualizados depois de uma ação mais recente do gestor já ter mudado
// o status na tela.
let renderTokenAtual = 0;

async function render() {
  const meuToken = ++renderTokenAtual;
  const pedidos = await fetchPedidos();
  if (meuToken !== renderTokenAtual) return;

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
    idsConhecidos = new Set();
    return;
  }

  pedidosAtuais = pedidos;

  const idsAtuais = new Set(pedidos.map(p => p.id));
  const novosIds  = idsConhecidos === null
    ? new Set()
    : new Set(pedidos.filter(p => !idsConhecidos.has(p.id)).map(p => p.id));
  idsConhecidos = idsAtuais;

  if (novosIds.size > 0) {
    notificarNovosPedidos(pedidos.filter(p => novosIds.has(p.id)));
  }

  // Mais recentes primeiro, entregues/recusados por último
  const finalizado = status => status === 'entregue' || status === 'recusado';
  const ordenados = [...pedidos].sort((a, b) => {
    if (finalizado(a.status) && !finalizado(b.status)) return  1;
    if (finalizado(b.status) && !finalizado(a.status)) return -1;
    return b.id - a.id;
  });

  el.innerHTML = ordenados.map(p => {
    const idx         = ORDEM.indexOf(p.status);
    const podeAvancar = idx !== -1 && idx < ORDEM.length - 1;
    const podeVoltar  = idx > 0;
    const podeNegar   = !finalizado(p.status);

    const itensHTML = p.itens.map(item => `
      <div class="item-row">
        <div>
          <div>${item.qtd}× ${escapeHtml(item.nome)}</div>
          ${item.extras && item.extras.length
            ? `<div class="item-extras">${escapeHtml(item.extras.join(', '))}</div>`
            : ''}
        </div>
        <div>R$ ${(item.preco * item.qtd).toFixed(2)}</div>
      </div>`).join('');

    const proximoLabel = {
      aguardando: '✅ Confirmar Pedido',
      confirmado: '🛵 Marcar a Caminho',
      a_caminho:  '🎉 Marcar como Entregue',
      entregue:   'Entregue',
      recusado:   'Recusado',
    }[p.status];

    const proximoClass = {
      aguardando: 'btn-confirmar',
      confirmado: 'btn-caminho',
      a_caminho:  'btn-entregue',
      entregue:   'btn-entregue',
      recusado:   'btn-recusado',
    }[p.status];

    // Exibe apenas os últimos 5 dígitos do ID para leitura rápida
    const idCurto   = String(p.id).slice(-5);
    const linkWA    = linkWhatsapp(p);
    const classeNovo = novosIds.has(p.id) ? ' novo' : '';

    return `
      <div class="pedido-card ${p.status}${classeNovo}">
        <div class="pedido-topo">
          <h2>Pedido #${idCurto} — ${p.hora}</h2>
          <span class="badge ${p.status}">${LABELS[p.status]}</span>
        </div>

        <div class="pedido-info">
          <strong>👤 ${escapeHtml(p.cliente.nome)}</strong><br>
          📞 ${escapeHtml(p.cliente.tel)}<br>
          🏠 ${escapeHtml(p.cliente.end)}
        </div>

        ${p.observacao ? `<div class="pedido-obs">📝 ${escapeHtml(p.observacao)}</div>` : ''}

        <div class="itens-lista">
          ${itensHTML}
          <div class="item-row">
            <span>Taxa de entrega</span>
            <span>R$ ${Number(p.taxa_entrega || 0).toFixed(2)}</span>
          </div>
          ${p.taxa_maquininha > 0 ? `
          <div class="item-row">
            <span>Taxa da maquininha</span>
            <span>R$ ${Number(p.taxa_maquininha).toFixed(2)}</span>
          </div>` : ''}
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
          ${podeVoltar ? `
            <button class="btn-acao btn-voltar" onclick="voltarStatus(${p.id})" title="Desfazer último avanço de status">
              ↩️ Voltar Status
            </button>` : ''}
          <button class="btn-acao btn-imprimir" onclick="imprimirPedido(${p.id})">
            🖨️ Imprimir
          </button>
          ${linkWA ? `
            <a class="btn-acao btn-whatsapp" href="${linkWA}" target="_blank" rel="noopener">
              📲 Avisar no WhatsApp
            </a>` : ''}
          ${podeNegar ? `
            <button class="btn-acao btn-negar" onclick="negarPedido(${p.id})">
              🚫 Negar Pedido
            </button>` : ''}
        </div>
      </div>`;
  }).join('');
}

// Atualiza a cada 5 segundos para pegar novos pedidos
sincronizarInscricao();
render();
setInterval(render, 5000);

// Histórico de vendas muda devagar — não precisa do polling rápido
renderVendasSemana();
setInterval(renderVendasSemana, 60000);
