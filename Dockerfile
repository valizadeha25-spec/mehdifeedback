FROM node:22-alpine AS base
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

RUN apk add --no-cache python3 py3-pip py3-virtualenv

COPY python/docling_service/requirements.txt ./python/docling_service/requirements.txt
RUN python3 -m venv /opt/docling-venv \
  && /opt/docling-venv/bin/pip install --no-cache-dir -r ./python/docling_service/requirements.txt

ENV PATH="/opt/docling-venv/bin:${PATH}"

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/python ./python
COPY --from=builder /app/start.sh ./start.sh

RUN chmod +x ./start.sh

EXPOSE 3000

CMD ["./start.sh"]
