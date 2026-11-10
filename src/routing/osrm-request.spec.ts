import { ApiError } from '../common/api-error';
import { computeUnits, parseRequest } from './osrm-request';

const LA_PAZ = '-68.1193,-16.4897';
const SOPOCACHI = '-68.15,-16.5';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof ApiError ? error.code : 'NotApiError';
  }
  return undefined;
}

describe('parseRequest', () => {
  it('acepta una ruta válida y agrega geometría GeoJSON por defecto', () => {
    const req = parseRequest('route', 'moto', `${LA_PAZ};${SOPOCACHI}`, { steps: 'true' });
    expect(req.service).toBe('route');
    expect(req.profile).toBe('moto');
    expect(req.coordinatesPath).toBe('-68.1193,-16.4897;-68.15,-16.5');
    expect(req.query).toBe('steps=true&geometries=geojson&overview=full');
    expect(req.units).toBe(1);
  });

  it('respeta la geometría que pide el cliente', () => {
    const req = parseRequest('route', 'car', `${LA_PAZ};${SOPOCACHI}`, {
      geometries: 'polyline6',
      overview: 'simplified',
    });
    expect(req.query).toBe('geometries=polyline6&overview=simplified');
  });

  it('acepta alias de perfil', () => {
    expect(parseRequest('route', 'driving', `${LA_PAZ};${SOPOCACHI}`, {}).profile).toBe('car');
    expect(parseRequest('route', 'MOTORCYCLE', `${LA_PAZ};${SOPOCACHI}`, {}).profile).toBe('moto');
  });

  it('rechaza servicio, perfil y coordenadas inválidos', () => {
    expect(codeOf(() => parseRequest('isochrone', 'car', LA_PAZ, {}))).toBe('NotFound');
    expect(codeOf(() => parseRequest('route', 'bus', `${LA_PAZ};${SOPOCACHI}`, {}))).toBe(
      'InvalidProfile',
    );
    expect(codeOf(() => parseRequest('route', 'car', LA_PAZ, {}))).toBe('TooManyCoordinates');
    expect(codeOf(() => parseRequest('route', 'car', `${LA_PAZ};abc,-16`, {}))).toBe(
      'InvalidCoordinates',
    );
    expect(codeOf(() => parseRequest('route', 'car', `${LA_PAZ};-68.1`, {}))).toBe(
      'InvalidCoordinates',
    );
  });

  it('rechaza coordenadas fuera de Bolivia o con lat/lon invertidos', () => {
    expect(codeOf(() => parseRequest('route', 'car', `${LA_PAZ};-58.38,-34.6`, {}))).toBe(
      'OutOfCoverage',
    );
    expect(codeOf(() => parseRequest('route', 'car', `-16.4897,-68.1193;${SOPOCACHI}`, {}))).toBe(
      'OutOfCoverage',
    );
  });

  it('aplica el máximo de coordenadas por servicio', () => {
    const many = (n: number) => Array.from({ length: n }, () => LA_PAZ).join(';');
    expect(codeOf(() => parseRequest('route', 'car', many(25), {}))).toBeUndefined();
    expect(codeOf(() => parseRequest('route', 'car', many(26), {}))).toBe('TooManyCoordinates');
    expect(codeOf(() => parseRequest('table', 'car', many(100), {}))).toBeUndefined();
    expect(codeOf(() => parseRequest('table', 'car', many(101), {}))).toBe('TooManyCoordinates');
    expect(codeOf(() => parseRequest('nearest', 'car', many(2), {}))).toBe('TooManyCoordinates');
  });

  it('solo permite parámetros de la lista y valores seguros', () => {
    expect(codeOf(() => parseRequest('route', 'car', `${LA_PAZ};${SOPOCACHI}`, { foo: '1' }))).toBe(
      'InvalidParameter',
    );
    expect(
      codeOf(() => parseRequest('route', 'car', `${LA_PAZ};${SOPOCACHI}`, { steps: 'true&x=1' })),
    ).toBe('InvalidParameter');
    expect(
      codeOf(() => parseRequest('route', 'car', `${LA_PAZ};${SOPOCACHI}`, { steps: ['a', 'b'] })),
    ).toBe('InvalidParameter');
    expect(
      codeOf(() => parseRequest('table', 'car', `${LA_PAZ};${SOPOCACHI}`, { steps: 'true' })),
    ).toBe('InvalidParameter');
  });
});

describe('computeUnits', () => {
  it('calcula el peso por servicio', () => {
    const none = new URLSearchParams();
    expect(computeUnits('route', 5, none)).toBe(1);
    expect(computeUnits('nearest', 1, none)).toBe(1);
    expect(computeUnits('trip', 12, none)).toBe(12);
    expect(computeUnits('match', 25, none)).toBe(3);
    expect(computeUnits('table', 10, none)).toBe(10);
    expect(computeUnits('table', 10, new URLSearchParams('sources=0&destinations=1;2;3'))).toBe(1);
    expect(computeUnits('table', 2, none)).toBe(1);
  });
});
