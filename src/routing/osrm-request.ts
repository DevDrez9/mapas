// Validación de las peticiones de rutas antes de enviarlas a OSRM.
// Son funciones puras (sin Nest ni red) para poder probarlas fácilmente.
import { ApiError } from '../common/api-error';

export type OsrmService = 'route' | 'table' | 'trip' | 'nearest' | 'match';
export type VehicleProfile = 'car' | 'moto';

/** Rectángulo que contiene a Bolivia. Coordenadas fuera de él se rechazan. */
export const BOLIVIA_BBOX = {
  minLon: -69.7,
  maxLon: -57.4,
  minLat: -23.0,
  maxLat: -9.6,
};

interface ServiceRules {
  minCoordinates: number;
  maxCoordinates: number;
  allowedParams: readonly string[];
  /** Parámetros que se agregan si el cliente no los envía. */
  defaults: Readonly<Record<string, string>>;
}

const POINT_PARAMS = [
  'radiuses',
  'bearings',
  'approaches',
  'hints',
  'generate_hints',
  'snapping',
  'exclude',
] as const;

const GEOMETRY_DEFAULTS = { geometries: 'geojson', overview: 'full' } as const;

export const SERVICE_RULES: Readonly<Record<OsrmService, ServiceRules>> = {
  route: {
    minCoordinates: 2,
    maxCoordinates: 25,
    allowedParams: [
      ...POINT_PARAMS,
      'alternatives',
      'steps',
      'annotations',
      'geometries',
      'overview',
      'continue_straight',
      'waypoints',
      'skip_waypoints',
    ],
    defaults: GEOMETRY_DEFAULTS,
  },
  table: {
    minCoordinates: 2,
    maxCoordinates: 100,
    allowedParams: [
      ...POINT_PARAMS,
      'sources',
      'destinations',
      'annotations',
      'fallback_speed',
      'fallback_coordinate',
      'scale_factor',
      'skip_waypoints',
    ],
    defaults: {},
  },
  trip: {
    minCoordinates: 2,
    maxCoordinates: 50,
    allowedParams: [
      ...POINT_PARAMS,
      'roundtrip',
      'source',
      'destination',
      'steps',
      'annotations',
      'geometries',
      'overview',
      'skip_waypoints',
    ],
    defaults: GEOMETRY_DEFAULTS,
  },
  nearest: {
    minCoordinates: 1,
    maxCoordinates: 1,
    allowedParams: [...POINT_PARAMS, 'number'],
    defaults: {},
  },
  match: {
    minCoordinates: 2,
    maxCoordinates: 100,
    allowedParams: [
      ...POINT_PARAMS,
      'steps',
      'geometries',
      'annotations',
      'overview',
      'timestamps',
      'gaps',
      'tidy',
      'waypoints',
      'skip_waypoints',
    ],
    defaults: GEOMETRY_DEFAULTS,
  },
};

const PROFILE_ALIASES: Readonly<Record<string, VehicleProfile>> = {
  car: 'car',
  auto: 'car',
  driving: 'car',
  moto: 'moto',
  motorcycle: 'moto',
  motocicleta: 'moto',
};

/** Caracteres permitidos en los valores de los parámetros (los que usa la sintaxis de OSRM). */
const SAFE_VALUE = /^[A-Za-z0-9_.,;:\-]*$/;
const MAX_VALUE_LENGTH = 4000;

export interface Coordinate {
  lon: number;
  lat: number;
}

export interface ParsedRequest {
  service: OsrmService;
  profile: VehicleProfile;
  coordinates: Coordinate[];
  /** Ruta lista para OSRM, por ejemplo "-68.1,-16.4;-68.2,-16.5". */
  coordinatesPath: string;
  /** Query string ya validada, sin "?" inicial. */
  query: string;
  /** Unidades que consume la petición si responde con éxito. */
  units: number;
}

export function parseService(value: string): OsrmService {
  if (Object.prototype.hasOwnProperty.call(SERVICE_RULES, value)) {
    return value as OsrmService;
  }
  throw ApiError.notFound(
    `Servicio "${value}" no existe. Usa: ${Object.keys(SERVICE_RULES).join(', ')}`,
  );
}

export function parseProfile(value: string): VehicleProfile {
  const profile = PROFILE_ALIASES[value.toLowerCase()];
  if (!profile) {
    throw ApiError.badRequest(`Perfil "${value}" no existe. Usa "car" o "moto"`, 'InvalidProfile');
  }
  return profile;
}

export function parseCoordinates(raw: string, service: OsrmService): Coordinate[] {
  const rules = SERVICE_RULES[service];
  const parts = raw.split(';');

  if (parts.length < rules.minCoordinates || parts.length > rules.maxCoordinates) {
    const range =
      rules.minCoordinates === rules.maxCoordinates
        ? `${rules.minCoordinates}`
        : `entre ${rules.minCoordinates} y ${rules.maxCoordinates}`;
    throw ApiError.badRequest(
      `"${service}" acepta ${range} coordenadas y recibió ${parts.length}`,
      'TooManyCoordinates',
    );
  }

  return parts.map((part, index) => {
    const pair = part.split(',');
    const lon = Number(pair[0]);
    const lat = Number(pair[1]);
    if (
      pair.length !== 2 ||
      pair[0].trim() === '' ||
      pair[1].trim() === '' ||
      !Number.isFinite(lon) ||
      !Number.isFinite(lat)
    ) {
      throw ApiError.badRequest(
        `Coordenada #${index + 1} inválida: "${part}". El formato es longitud,latitud (por ejemplo -68.1193,-16.4897)`,
        'InvalidCoordinates',
      );
    }
    if (
      lon < BOLIVIA_BBOX.minLon ||
      lon > BOLIVIA_BBOX.maxLon ||
      lat < BOLIVIA_BBOX.minLat ||
      lat > BOLIVIA_BBOX.maxLat
    ) {
      throw ApiError.badRequest(
        `Coordenada #${index + 1} (${part}) está fuera de Bolivia. Recuerda que el orden es longitud,latitud`,
        'OutOfCoverage',
      );
    }
    return { lon, lat };
  });
}

/** Valida la query contra la lista de parámetros permitidos y agrega los valores por defecto. */
export function buildQuery(service: OsrmService, query: Record<string, unknown>): URLSearchParams {
  const rules = SERVICE_RULES[service];
  const params = new URLSearchParams();

  for (const [name, rawValue] of Object.entries(query)) {
    if (!rules.allowedParams.includes(name)) {
      throw ApiError.badRequest(
        `Parámetro "${name}" no permitido en "${service}". Permitidos: ${rules.allowedParams.join(', ')}`,
        'InvalidParameter',
      );
    }
    if (typeof rawValue !== 'string') {
      throw ApiError.badRequest(`Parámetro "${name}" repetido o con formato inválido`, 'InvalidParameter');
    }
    if (rawValue.length > MAX_VALUE_LENGTH || !SAFE_VALUE.test(rawValue)) {
      throw ApiError.badRequest(`Valor inválido en el parámetro "${name}"`, 'InvalidParameter');
    }
    params.set(name, rawValue);
  }

  for (const [name, value] of Object.entries(rules.defaults)) {
    if (!params.has(name)) params.set(name, value);
  }

  return params;
}

/** Cuenta los índices de "sources"/"destinations" de una matriz ("all" o "0;2;5"). */
function countIndexes(value: string | null, total: number): number {
  if (value === null || value === '' || value === 'all') return total;
  return value.split(';').length;
}

/**
 * Peso de la petición en unidades (base para cobrar por uso en el futuro):
 *   route, nearest: 1  ·  trip: 1 por parada  ·  table: 1 por cada 10 celdas  ·  match: 1 por cada 10 puntos
 */
export function computeUnits(
  service: OsrmService,
  coordinateCount: number,
  params: URLSearchParams,
): number {
  switch (service) {
    case 'route':
    case 'nearest':
      return 1;
    case 'trip':
      return coordinateCount;
    case 'match':
      return Math.ceil(coordinateCount / 10);
    case 'table': {
      const sources = countIndexes(params.get('sources'), coordinateCount);
      const destinations = countIndexes(params.get('destinations'), coordinateCount);
      return Math.max(1, Math.ceil((sources * destinations) / 10));
    }
  }
}

/** Valida toda la petición y la deja lista para enviarla a OSRM. */
export function parseRequest(
  serviceRaw: string,
  profileRaw: string,
  coordinatesRaw: string,
  query: Record<string, unknown>,
): ParsedRequest {
  const service = parseService(serviceRaw);
  const profile = parseProfile(profileRaw);
  const coordinates = parseCoordinates(coordinatesRaw, service);
  const params = buildQuery(service, query);

  return {
    service,
    profile,
    coordinates,
    coordinatesPath: coordinates.map((c) => `${c.lon},${c.lat}`).join(';'),
    // Sin codificar: los valores ya se validaron con SAFE_VALUE y OSRM espera ";" y "," literales.
    query: Array.from(params, ([name, value]) => `${name}=${value}`).join('&'),
    units: computeUnits(service, coordinates.length, params),
  };
}
