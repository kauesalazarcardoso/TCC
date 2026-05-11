// Redireciona para a página de pedido
function irParaPagina() {
  window.location.href = "pedido.html";
}

// Gera bolhas animadas nas laterais
function criarBolhas() {
  const lados = [
    document.querySelector('.bolhas-esquerda'),
    document.querySelector('.bolhas-direita')
  ];

  lados.forEach(lado => {
    const qtd = 8;
    for (let i = 0; i < qtd; i++) {
      const b = document.createElement('div');
      b.classList.add('bolha');

      const tamanho = Math.random() * 30 + 14; // 14px – 44px
      const left    = Math.random() * 70;       // posição horizontal dentro da faixa
      const duracao = Math.random() * 10 + 8;   // 8s – 18s
      const delay   = Math.random() * 12;       // delay inicial variado

      b.style.cssText = `
        width: ${tamanho}px;
        height: ${tamanho}px;
        left: ${left}%;
        animation-duration: ${duracao}s;
        animation-delay: -${delay}s;
      `;

      lado.appendChild(b);
    }
  });
}

document.addEventListener('DOMContentLoaded', criarBolhas);
