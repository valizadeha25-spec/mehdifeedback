#!/bin/sh
set -eu

DOCLING_HOST="${DOCLING_HOST:-127.0.0.1}"
DOCLING_PORT="${DOCLING_PORT:-8000}"

if [ "${ENABLE_BUNDLED_DOCLING:-1}" = "1" ]; then
  uvicorn python.docling_service.main:app --host "$DOCLING_HOST" --port "$DOCLING_PORT" &
fi

exec node server.js
