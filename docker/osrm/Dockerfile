ARG OSRM_VERSION=v26.10.0-debian
FROM ghcr.io/project-osrm/osrm-backend:${OSRM_VERSION}

USER root

# curl: para descargar el mapa y para el healthcheck
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/osrm-entrypoint.sh
# Quita saltos de línea de Windows (CRLF) por si el archivo se editó en Windows
RUN sed -i 's/\r$//' /usr/local/bin/osrm-entrypoint.sh \
    && chmod +x /usr/local/bin/osrm-entrypoint.sh

VOLUME ["/data"]
EXPOSE 5000

ENTRYPOINT ["/usr/local/bin/osrm-entrypoint.sh"]
