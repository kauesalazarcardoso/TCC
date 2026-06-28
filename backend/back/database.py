import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'db', 'pedidos.db')

_ITENS_INICIAIS = [
    ("Copo 200ml Econômico",   10.00),
    ("Copo 300ml Tradicional", 15.00),
    ("Copo 400ml Médio",       18.00),
    ("Copo 500ml Grande",      22.00),
    ("Copo 700ml Gigante",     28.00),
    ("Tigela 500ml Casa",      24.00),
    ("Tigela 800ml Família",   35.00),
    ("Barca de Açaí P",        45.00),
    ("Barca de Açaí G",        65.00),
    ("Copo Trufado Nutella",   26.00),
    ("Copo Trufado Ninho",     26.00),
    ("Açaí Zero Açúcar 400ml", 21.00),
]

_COMPLEMENTOS_INICIAIS = [
    "Leite em Pó", "Granola", "Banana", "Morango", "Nutella",
    "Paçoca", "Leite Condensado", "M&Ms", "Coco Ralado",
    "Ovomaltine", "Bis", "Kiwi",
]


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pedidos (
                id      INTEGER PRIMARY KEY,
                cliente TEXT    NOT NULL,
                itens   TEXT    NOT NULL,
                total   REAL    NOT NULL,
                status  TEXT    NOT NULL DEFAULT 'aguardando',
                hora    TEXT    NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cardapio (
                id    INTEGER PRIMARY KEY AUTOINCREMENT,
                nome  TEXT    NOT NULL,
                preco REAL    NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS complementos (
                id   INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT    NOT NULL UNIQUE
            )
        """)
        if conn.execute("SELECT COUNT(*) FROM cardapio").fetchone()[0] == 0:
            conn.executemany(
                "INSERT INTO cardapio (nome, preco) VALUES (?, ?)",
                _ITENS_INICIAIS
            )
        if conn.execute("SELECT COUNT(*) FROM complementos").fetchone()[0] == 0:
            conn.executemany(
                "INSERT INTO complementos (nome) VALUES (?)",
                [(n,) for n in _COMPLEMENTOS_INICIAIS]
            )
    print("✅ Banco SQLite inicializado!")
