// Configuración leída de variables de entorno, con valores por defecto.

function toInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export const config = {
  port: toInt('PORT', 3009),
  adminToken: (process.env.ADMIN_TOKEN ?? '').trim(),
  osrm: {
    carUrl: trimSlash(
      process.env.OSRM_CAR_URL ?? process.env.OSRM_URL ?? 'http://localhost:5000',
    ),
    motoUrl: trimSlash(process.env.OSRM_MOTO_URL ?? 'http://localhost:5001'),
    timeoutMs: toInt('OSRM_TIMEOUT_MS', 10_000),
  },
  rateLimit: {
    perSecond: toInt('RATE_LIMIT_RPS', 20),
    burst: toInt('RATE_LIMIT_BURST', 40),
  },
  /** Zona horaria usada para agrupar el uso por día. */
  usageTimeZone: process.env.USAGE_TIME_ZONE ?? 'America/La_Paz',
};

/** Longitud mínima aceptada para ADMIN_TOKEN. */
export const MIN_ADMIN_TOKEN_LENGTH = 24;
