# Imagen del backend NestJS (adaptador Express) + Prisma
# Debian slim en lugar de Alpine para evitar problemas de OpenSSL con Prisma.

FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# URL ficticia solo para el build: "prisma generate" no se conecta a la base,
# pero algunas configuraciones de Prisma exigen que la variable exista.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

COPY package*.json ./
RUN npm ci

COPY . .
RUN if [ -f prisma/schema.prisma ] || [ -d prisma/schema ]; then npx prisma generate; fi
RUN npm run build


FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Se copia el proyecto completo ya compilado (incluye el CLI de Prisma para las migraciones).
COPY --from=build /app /app

COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/api-entrypoint.sh \
    && chmod +x /usr/local/bin/api-entrypoint.sh

EXPOSE 3009
ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]
