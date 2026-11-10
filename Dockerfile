# University Website: single-container site, admin panel, user portals and API
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt ./
# Chromium (headless) — maqola PDF'i va ijtimoiy tarmoq kartalarini (og:image) chizish uchun
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# libarchive13 — Google Drive'dagi RAR/ZIP arxivlar ichidagi hujjatlarni saytda ochish uchun (libarchive-c)
RUN apt-get update && apt-get install -y --no-install-recommends libarchive13 \
    && pip install --no-cache-dir -r requirements.txt \
    && python -m playwright install --with-deps --only-shell chromium \
    && rm -rf /var/lib/apt/lists/*
COPY backend/ ./backend/
COPY --from=web /web/dist ./frontend/dist
ENV SITE_DATA_DIR=/data \
    SITE_STATIC_DIR=/app/frontend/dist \
    PYTHONUNBUFFERED=1
VOLUME ["/data"]
EXPOSE 8000
WORKDIR /app/backend
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)" || exit 1
CMD ["uvicorn", "university.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
