FROM python:3.11-slim

WORKDIR /app

# deps primero para cache de capas
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
