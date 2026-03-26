FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV ENABLE_BUNDLED_DOCLING=1
ENV DOCLING_HOST=127.0.0.1
ENV DOCLING_PORT=8000
ENV PDF_PARSER_URL=http://127.0.0.1:8000
ENV PIP_NO_CACHE_DIR=1
ENV PIP_PREFER_BINARY=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    libglib2.0-0 \
    libgl1 \
  && rm -rf /var/lib/apt/lists/*

COPY python/docling_service/requirements.txt ./python/docling_service/requirements.txt
RUN python3 -m venv /opt/docling-venv \
  && /opt/docling-venv/bin/pip install --upgrade pip setuptools wheel \
  && /opt/docling-venv/bin/pip install -r ./python/docling_service/requirements.txt

ENV PATH="/opt/docling-venv/bin:${PATH}"

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/python ./python
COPY --from=builder /app/start.sh ./start.sh

RUN chmod +x ./start.sh

EXPOSE 3000

CMD ["./start.sh"]
