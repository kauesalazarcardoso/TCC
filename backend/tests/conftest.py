import sys
import os
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'back')))

from app import app as flask_app, init_db


@pytest.fixture
def client():
    flask_app.config['TESTING'] = True
    init_db()
    with flask_app.test_client() as client:
        yield client
