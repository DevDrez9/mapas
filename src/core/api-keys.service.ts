import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from './prisma.service';

/** Datos de la key ya validada que se adjuntan a cada petición. */
export interface ApiKeyContext {
  apiKeyId: string;
  projectId: string;
  projectName: string;
}

interface CacheEntry {
  value: ApiKeyContext;
  expiresAt: number;
}

const KEY_PREFIX = 'rk_';
const CACHE_TTL_MS = 60_000;
const LAST_USED_THROTTLE_MS = 60_000;

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey, 'utf8').digest('hex');
}

/** Genera una key nueva: "rk_" + 43 caracteres aleatorios (256 bits). */
export function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(32).toString('base64url');
}

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly lastUsedWrites = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  /** Crea una key para el proyecto y devuelve la key completa (solo esta vez). */
  async create(projectId: string, name?: string) {
    const rawKey = generateApiKey();
    const record = await this.prisma.apiKey.create({
      data: {
        projectId,
        name: name?.trim() || null,
        keyHash: hashApiKey(rawKey),
        keyPrefix: rawKey.slice(0, 8),
        lastFour: rawKey.slice(-4),
      },
    });
    return { record, rawKey };
  }

  /** Valida una key recibida. Devuelve null si no existe, está revocada o el proyecto está inactivo. */
  async validate(rawKey: string): Promise<ApiKeyContext | null> {
    if (!rawKey.startsWith(KEY_PREFIX) || rawKey.length < 20 || rawKey.length > 100) {
      return null;
    }

    const hash = hashApiKey(rawKey);
    const now = Date.now();
    const cached = this.cache.get(hash);
    if (cached && cached.expiresAt > now) return cached.value;

    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash: hash },
      include: { project: { select: { id: true, name: true, active: true } } },
    });

    if (!key || key.revokedAt || !key.project.active) {
      this.cache.delete(hash);
      return null;
    }

    const value: ApiKeyContext = {
      apiKeyId: key.id,
      projectId: key.project.id,
      projectName: key.project.name,
    };
    this.cache.set(hash, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  }

  /** Actualiza lastUsedAt como mucho una vez por minuto por key, sin bloquear la petición. */
  touch(apiKeyId: string): void {
    const now = Date.now();
    const last = this.lastUsedWrites.get(apiKeyId) ?? 0;
    if (now - last < LAST_USED_THROTTLE_MS) return;
    this.lastUsedWrites.set(apiKeyId, now);

    this.prisma.apiKey
      .update({ where: { id: apiKeyId }, data: { lastUsedAt: new Date(now) } })
      .catch((error: Error) =>
        this.logger.warn(`No se pudo actualizar lastUsedAt: ${error.message}`),
      );
  }

  /** Quita del caché todas las keys de un proyecto (al revocar, desactivar o borrar). */
  invalidateProject(projectId: string): void {
    for (const [hash, entry] of this.cache) {
      if (entry.value.projectId === projectId) this.cache.delete(hash);
    }
  }

  /** Quita del caché una key concreta. */
  invalidateKey(apiKeyId: string): void {
    for (const [hash, entry] of this.cache) {
      if (entry.value.apiKeyId === apiKeyId) this.cache.delete(hash);
    }
    this.lastUsedWrites.delete(apiKeyId);
  }
}
