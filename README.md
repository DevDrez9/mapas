# SaaS de rutas (OSRM + NestJS)

API de rutas para Bolivia con dos motores OSRM, **auto** y **moto**, detrás de una API NestJS con proyectos y API keys.

```
Cliente ──x-api-key──▶ API NestJS :3009 ──▶ osrm       (auto)
                            │           └─▶ osrm-moto  (moto)
                            └─▶ Postgres (proyectos, keys, uso)
```

## Puesta en marcha (servidor)

```bash
cp .env.example .env
PW=$(openssl rand -hex 16); sed -i "s/cambia_esta_clave/$PW/g" .env
TOKEN=$(openssl rand -hex 24); sed -i "s/cambia_este_token_de_administrador/$TOKEN/" .env
docker compose up -d --build
docker compose logs -f osrm-moto   # el primer arranque procesa el mapa (unos minutos)
curl http://localhost:3009/health  # {"status":"ok",...}
```

La API aplica las migraciones de Prisma al arrancar. Para actualizar después de un `git pull`: `docker compose up -d --build`.

## Administración (header `x-admin-token`)

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/admin/projects` | Crea un proyecto `{"name": "...", "description": "..."}` |
| GET | `/admin/projects` | Lista proyectos |
| GET | `/admin/projects/:id` | Detalle con sus keys |
| PATCH | `/admin/projects/:id` | Cambia `name`, `description` o `active` |
| DELETE | `/admin/projects/:id` | Borra el proyecto, sus keys y su uso |
| POST | `/admin/projects/:id/keys` | Crea una key `{"name": "android"}`. **Se muestra una sola vez** |
| GET | `/admin/projects/:id/keys` | Lista keys (sin el valor completo) |
| DELETE | `/admin/keys/:keyId` | Revoca una key al instante |
| GET | `/admin/projects/:id/usage?days=30` | Consumo por día, servicio y perfil |

```bash
A="x-admin-token: TU_ADMIN_TOKEN"
curl -X POST -H "$A" -H 'content-type: application/json' -d '{"name":"App Delivery"}' http://localhost:3009/admin/projects
curl -X POST -H "$A" -H 'content-type: application/json' -d '{"name":"android"}' http://localhost:3009/admin/projects/<ID>/keys
```

## API de rutas (header `x-api-key`)

```
GET /v1/{servicio}/{perfil}/{lon,lat;lon,lat;...}?parámetros
```

- **perfil**: `car` (alias `auto`, `driving`) o `moto` (alias `motorcycle`).
- **servicio**: los de OSRM, con sus mismos parámetros ([documentación](https://project-osrm.org/docs/v5.24.0/api/)).

| Servicio | Para qué | Coordenadas | Unidades |
|---|---|---|---|
| `route` | Ruta entre puntos | 2–25 | 1 |
| `table` | Matriz de tiempos/distancias | 2–100 | 1 por cada 10 celdas |
| `trip` | Orden óptimo de paradas (1 vehículo) | 2–50 | 1 por parada |
| `nearest` | Calle más cercana a un punto | 1 | 1 |
| `match` | Ajustar un recorrido GPS a las calles | 2–100 | 1 por cada 10 puntos |

- El orden es **longitud,latitud**. Coordenadas fuera de Bolivia responden `400 OutOfCoverage`.
- `route`, `trip` y `match` devuelven la geometría en **GeoJSON completa** por defecto (lista para dibujar). Puedes cambiarlo con `geometries=polyline6` u `overview=simplified`.
- `distance` viene en **metros** y `duration` en **segundos**.
- Solo las respuestas exitosas suman unidades (cabecera `X-Units`).
- Límite: `RATE_LIMIT_RPS` peticiones por segundo por key (por defecto 20, ráfaga 40). Al pasarse: `429` con `Retry-After`.

```bash
curl -H "x-api-key: rk_..." \
  "http://localhost:3009/v1/route/moto/-68.1193,-16.4897;-68.1500,-16.5000?steps=true"
```

Errores: `{"code": "...", "message": "..."}` (`MissingApiKey`, `InvalidApiKey`, `InvalidCoordinates`, `OutOfCoverage`, `TooManyCoordinates`, `InvalidParameter`, `RateLimited`, `EngineUnavailable`, `UpstreamTimeout`, y los propios de OSRM como `NoRoute`).

## Perfil de moto

`docker/osrm/profiles/moto.lua` reutiliza el perfil de auto y cambia: acceso `motorcycle=*`, dimensiones de moto, velocidades urbanas algo mayores (`SPEED_FACTOR`) y caminos `track`. Si lo modificas, reprocesa el mapa de motos:

```bash
docker compose build osrm-moto
docker compose run --rm --entrypoint rm osrm-moto -f /data/moto/.ready
docker compose up -d osrm-moto
```

## Desarrollo local

```bash
npm install
docker compose up -d postgres osrm osrm-moto
npx prisma migrate dev     # aplica migraciones y genera el cliente
npm run start:dev          # http://localhost:3009
npm test
```

Para cambiar el modelo de datos: edita `prisma/schema.prisma` y corre `npx prisma migrate dev --name <cambio>`.

## Atribución

Los datos del mapa son © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (licencia ODbL). Muestra esta atribución en las apps que usen las rutas.
