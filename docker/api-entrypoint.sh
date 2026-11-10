#!/bin/sh
# Aplica las migraciones pendientes de Prisma y arranca NestJS.
set -e

cd /app

if [ -f prisma/schema.prisma ] || [ -d prisma/schema ]; then
  echo "[api] Aplicando migraciones de Prisma..."
  npx prisma migrate deploy
fi

if [ -f dist/main.js ]; then
  exec node dist/main.js
elif [ -f dist/src/main.js ]; then
  exec node dist/src/main.js
fi

echo "[api] No se encontró dist/main.js ni dist/src/main.js. ¿Corrió 'npm run build'?" >&2
exit 1
