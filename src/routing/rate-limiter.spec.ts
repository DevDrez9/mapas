import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  it('permite la ráfaga y luego limita', () => {
    const limiter = new RateLimiter(2, 3);
    const t = 1_000_000;
    expect(limiter.consume('k', t).allowed).toBe(true);
    expect(limiter.consume('k', t).allowed).toBe(true);
    expect(limiter.consume('k', t).allowed).toBe(true);
    const blocked = limiter.consume('k', t);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
  });

  it('recarga con el tiempo y separa por key', () => {
    const limiter = new RateLimiter(2, 2);
    const t = 1_000_000;
    limiter.consume('a', t);
    limiter.consume('a', t);
    expect(limiter.consume('a', t).allowed).toBe(false);
    expect(limiter.consume('b', t).allowed).toBe(true);
    expect(limiter.consume('a', t + 500).allowed).toBe(true);
  });
});
