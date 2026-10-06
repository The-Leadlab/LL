FROM python:3.12.7-slim

WORKDIR /app

# Reduce glibc allocator fragmentation on small Render free instances (512MB).
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MALLOC_ARENA_MAX=2 \
    WEB_CONCURRENCY=1

RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
WORKDIR /app/backend

EXPOSE 8000

# Single worker + request recycling keeps RSS under free-plan memory.
# Render injects $PORT; fall back to 8000 for local docker runs.
CMD ["sh", "-c", "gunicorn main:app -k uvicorn.workers.UvicornWorker -w ${WEB_CONCURRENCY:-1} --bind 0.0.0.0:${PORT:-8000} --timeout 120 --max-requests 200 --max-requests-jitter 40 --graceful-timeout 30"]
