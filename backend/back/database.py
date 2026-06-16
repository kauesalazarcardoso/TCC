import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'db', 'pedidos.db')


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
    print("✅ Banco SQLite inicializado!")
