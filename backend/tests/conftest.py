import sys
import os
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'back')))

from app import app as flask_app
from database import init_db
import database


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(database, "DB_PATH", str(tmp_path / "test.db"))
    flask_app.config['TESTING'] = True
    init_db()
    with flask_app.test_client() as client:
        yield client
