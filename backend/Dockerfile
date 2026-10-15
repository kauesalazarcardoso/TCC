FROM python:3.11-slim

WORKDIR /app

COPY . .

RUN pip install --no-cache-dir -r requirements.txt

CMD gunicorn --chdir back --bind 0.0.0.0:${PORT:-5000} --timeout 180 --workers 1 --threads 8 --worker-class gthread app:app