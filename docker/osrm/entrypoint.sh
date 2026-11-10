#!/bin/sh
# Prepara los datos de OSRM la primera vez y luego arranca el servidor.
#  - Descarga el extracto .osm.pbf de Geofabrik si no existe.
#  - Lo procesa (extract -> partition -> customize) para el perfil indicado.
#  - Marca el perfil como listo para no reprocesar en cada reinicio.
#
# Para actualizar el mapa: borra /data/<region>.osm.pbf y /data/<perfil>/.ready
# (o el volumen osrm_data completo) y reinicia el contenedor.
set -eu

PROFILE="${OSRM_PROFILE:-car}"          # car | foot | bicycle
REGION="${OSRM_REGION:-bolivia}"
PBF_URL="${OSRM_PBF_URL:-https://download.geofabrik.de/south-america/bolivia-latest.osm.pbf}"

DATA_DIR="/data"
PROFILE_DIR="$DATA_DIR/$PROFILE"
PBF="$DATA_DIR/$REGION.osm.pbf"
BASE="$PROFILE_DIR/$REGION.osrm"
READY="$PROFILE_DIR/.ready"

if [ ! -f "/opt/$PROFILE.lua" ]; then
  echo "[osrm] Perfil desconocido: $PROFILE (no existe /opt/$PROFILE.lua)" >&2
  exit 1
fi

mkdir -p "$PROFILE_DIR"

if [ ! -f "$PBF" ]; then
  echo "[osrm] Descargando mapa: $PBF_URL"
  curl -fL --retry 3 -o "$PBF.part" "$PBF_URL"
  mv "$PBF.part" "$PBF"
fi

if [ ! -f "$READY" ]; then
  echo "[osrm] Procesando perfil '$PROFILE' para '$REGION' (puede tardar varios minutos)..."
  rm -f "$PROFILE_DIR/$REGION".osrm*
  cp "$PBF" "$PROFILE_DIR/$REGION.osm.pbf"
  osrm-extract -p "/opt/$PROFILE.lua" "$PROFILE_DIR/$REGION.osm.pbf"
  osrm-partition "$BASE"
  osrm-customize "$BASE"
  rm -f "$PROFILE_DIR/$REGION.osm.pbf"
  date > "$READY"
  echo "[osrm] Datos listos."
fi

echo "[osrm] Iniciando osrm-routed (perfil: $PROFILE)"
exec osrm-routed \
  --algorithm mld \
  --ip 0.0.0.0 \
  --port 5000 \
  --max-viaroute-size 25 \
  --max-table-size 100 \
  --max-trip-size 50 \
  --max-matching-size 100 \
  --max-nearest-size 10 \
  "$BASE"
