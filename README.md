# Sistema Web de Pedidos — Açaí Express

Sistema web para gerenciamento de pedidos de açaí, desenvolvido para pequenos estabelecimentos. Substitui atendimentos manuais por um fluxo digital com painel separado para cliente e gestor.

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Frontend | HTML, CSS, JavaScript, Nginx |
| Backend | Python, Flask, Flask-CORS |
| Banco de dados | SQLite |
| Infraestrutura | Docker, Docker Compose |
| Testes | Pytest |

---

## Arquitetura

```
projetoMultidiciplinar/
├── frontend/
│   ├── html/
│   │   ├── index.html           # Página inicial (cliente)
│   │   ├── pedido.html          # Montagem de pedido (cliente)
│   │   ├── acompanhar.html      # Acompanhamento de pedidos (cliente)
│   │   └── estabelecimento.html # Painel do gestor (acesso restrito à porta 8081)
│   ├── css/
│   ├── js/
│   └── Dockerfile
├── backend/
│   ├── back/
│   │   ├── app.py               # Entrada da aplicação Flask
│   │   ├── database.py          # Conexão e inicialização do banco
│   │   └── routes/
│   │       └── pedidos.py       # Rotas da API
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_unit.py
│   │   └── test_integracao.py
│   ├── requirements.txt
│   └── Dockerfile
├── db/                          # Volume do banco SQLite (gerado automaticamente, não versionado)
└── docker-compose.yml
```

---

## Como executar

### Pré-requisito

- [Docker](https://www.docker.com/) instalado

### Subir o projeto

```bash
docker compose up --build -d
```

### Encerrar

```bash
docker compose down
```

---

## Acesso

### Cliente (porta 8080)

| Página | URL |
|---|---|
| Início | http://localhost:8080 |
| Fazer pedido | http://localhost:8080/html/pedido.html |
| Acompanhar pedidos | http://localhost:8080/html/acompanhar.html |

### Gestor (porta 8081)

| Página | URL |
|---|---|
| Painel de pedidos | http://localhost:8081 |

### Admin (porta 8082)

| Página | URL |
|---|---|
| Gerenciar cardápio | http://localhost:8082 |

> Cada interface é isolada por porta no mesmo container Nginx. A porta 8080 bloqueia (`403`) o acesso a `estabelecimento.html` e `admin.html`. A porta 8081 bloqueia `admin.html`. Apenas a porta 8082 serve o painel admin.

---

## Funcionalidades do cliente

- Montar pedido com produtos e acompanhamentos
- Acompanhar **múltiplos pedidos simultâneos** em tempo real (atualização automática a cada 5 segundos)
- Os pedidos ativos ficam salvos localmente no navegador — o cliente pode fechar e reabrir a página sem perder o acompanhamento
- Pedidos entregues são removidos automaticamente da lista de acompanhamento

---

## API — Backend

Base URL: `http://localhost:5000`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Health check |
| GET | `/pedidos` | Lista todos os pedidos |
| GET | `/pedidos/<id>` | Busca pedido por ID |
| POST | `/pedidos` | Cria novo pedido |
| PATCH | `/pedidos/<id>/status` | Avança status do pedido |
| DELETE | `/pedidos/entregues` | Remove pedidos entregues |
| GET | `/cardapio` | Lista itens do cardápio |
| POST | `/cardapio` | Cria item no cardápio |
| PUT | `/cardapio/<id>` | Edita nome e preço de um item |
| DELETE | `/cardapio/<id>` | Remove item do cardápio |

### Fluxo de status

```
aguardando → confirmado → a_caminho → entregue
```

### Exemplo de criação de pedido

```bash
curl -X POST http://localhost:5000/pedidos \
  -H "Content-Type: application/json" \
  -d '{
    "cliente": {"nome": "João", "tel": "51999999999", "end": "Rua das Flores, 10 — Centro, Rolante"},
    "itens": [{"nome": "Copo 400ml Médio", "preco": 18.0, "extras": ["Granola", "Banana"], "qtd": 1}],
    "total": 18.0
  }'
```

---

## Testes

Com o projeto rodando (`docker compose up --build -d`):

```bash
docker compose exec backend python -m pytest tests/ -v
```

Ou sem o projeto em execução (container descartável):

```bash
docker compose run --rm backend python -m pytest tests/ -v
```

10 testes cobrindo criação, listagem, busca, avanço de status, remoção e casos de erro. Cada teste roda com banco isolado em memória.

---

## Rebuild após alterações

```bash
docker compose up --build -d
```

---

## Informações Acadêmicas

**Instituto Federal de Educação, Ciência e Tecnologia — Rio Grande do Sul — Campus Rolante**  
Curso Superior em Tecnologia em Análise e Desenvolvimento de Sistemas  
**Aluno:** Kauê Salazar Cardoso  
**Disciplina:** Projeto Multidisciplinar  
**Projeto:** Sistema Web de Pedidos de Açaí
