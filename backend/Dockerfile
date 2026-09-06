FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_TRUSTED_HOST="pypi.org files.pythonhosted.org pypi.python.org" \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/
RUN pip install -r requirements.txt

COPY . /app/

RUN chmod +x /app/docker/entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/app/docker/entrypoint.sh"]
# Produksiyada ko'p jarayon: Daphne bitta jarayonda ishlaydi va 1000+
# ulanishda bottleneck bo'ladi. Uvicorn esa `--workers` bilan bir nechta
# jarayon ochadi, har biri o'z WebSocket va HTTP so'rovlarini ko'taradi.
# Worker soni muhit o'zgaruvchisi bilan sozlanadi (standart 4).
CMD ["uvicorn", "config.asgi:application", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--lifespan", "off"]
