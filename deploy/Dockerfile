# Sotto server image (D-020). The web app is exported on the Mac by deploy/push.sh (apps/app/dist)
# and copied in; the server is the Python worker package. Keys never enter the image: the owner
# adds them in Admin → Keys & providers, encrypted with SOTTO_SECRET_KEY from /etc/sotto/sotto.env.
FROM python:3.14-slim

COPY --from=ghcr.io/astral-sh/uv:0.12.23 /uv /usr/local/bin/uv

ENV UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PYTHONUNBUFFERED=1 \
    SOTTO_DATA_DIR=/data

WORKDIR /app/apps/agent-worker
COPY apps/agent-worker/pyproject.toml apps/agent-worker/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY apps/agent-worker/ ./
RUN uv sync --frozen --no-dev
COPY seed/ /app/seed/
COPY apps/app/dist/ /app/apps/app/dist/

RUN useradd --system --uid 10001 sotto && mkdir -p /data && chown sotto /data
USER sotto
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8787/healthz', timeout=2)"
CMD ["/opt/venv/bin/python", "-m", "sotto_worker.server", "--host", "0.0.0.0", "--port", "8787"]
