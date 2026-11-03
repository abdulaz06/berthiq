# Production API image (deploy/compose.prod.yml). Multi-arch: builds on linux/amd64
# and linux/arm64 (the Oracle Ampere host). Daily development does not use it.
#
#   docker build -t berthiq-api backend
#
# The committed risk model ships in the image; nothing is trained at startup.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    PORT=8000

WORKDIR /app

COPY requirements.lock ./
RUN pip install -r requirements.lock

COPY pyproject.toml alembic.ini ./
COPY app ./app
COPY scripts ./scripts
COPY data ./data
COPY models ./models
RUN pip install --no-deps . \
    && useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin berthiq

USER berthiq
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"]

CMD ["python", "scripts/serve.py"]
