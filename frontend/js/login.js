const PAGINA_PADRAO_APOS_LOGIN = 'estabelecimento.html';

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();

  const usuario = document.getElementById('input-usuario').value.trim();
  const senha   = document.getElementById('input-senha').value;
  const erro    = document.getElementById('login-erro');
  const botao   = document.getElementById('btn-entrar');

  erro.textContent = '';
  botao.disabled    = true;
  botao.textContent = 'Entrando…';

  try {
    const res  = await fetch(`${AUTH_API}/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ usuario, senha })
    });
    const data = await res.json();

    if (!res.ok) {
      erro.textContent = data.erro || 'Não foi possível entrar.';
      return;
    }

    setToken(data.token);

    const next = new URLSearchParams(location.search).get('next');
    location.href = next || PAGINA_PADRAO_APOS_LOGIN;

  } catch (e) {
    erro.textContent = 'Erro ao conectar ao servidor. Verifique se o backend está rodando.';
  } finally {
    botao.disabled    = false;
    botao.textContent = 'Entrar';
  }
});
