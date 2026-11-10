// Límite de peticiones por API key con el algoritmo "token bucket", en memoria.
// Suficiente para un solo contenedor de API; con varias réplicas habría que moverlo a Redis.

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Segundos que hay que esperar si allowed es false. */
  retryAfterSeconds: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly perSecond: number,
    private readonly burst: number,
  ) {}

  consume(key: string, now = Date.now()): RateLimitResult {
    const bucket = this.buckets.get(key) ?? { tokens: this.burst, updatedAt: now };
    const elapsedSeconds = Math.max(0, now - bucket.updatedAt) / 1000;
    bucket.tokens = Math.min(this.burst, bucket.tokens + elapsedSeconds * this.perSecond);
    bucket.updatedAt = now;

    let allowed = false;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      allowed = true;
    }
    this.buckets.set(key, bucket);
    this.cleanup(now);

    return {
      allowed,
      limit: this.perSecond,
      remaining: Math.floor(bucket.tokens),
      retryAfterSeconds: allowed ? 0 : Math.ceil((1 - bucket.tokens) / this.perSecond),
    };
  }

  /** Borra cubetas llenas e inactivas para no acumular memoria. */
  private cleanup(now: number): void {
    if (this.buckets.size < 1000) return;
    const refillMs = (this.burst / this.perSecond) * 1000;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updatedAt > refillMs) this.buckets.delete(key);
    }
  }
}
