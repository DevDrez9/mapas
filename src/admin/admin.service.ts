import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { config } from '../config';
import { ApiKeysService } from '../core/api-keys.service';
import { PrismaService } from '../core/prisma.service';

export interface ProjectInput {
  name?: unknown;
  description?: unknown;
  active?: unknown;
}

const MAX_NAME = 100;
const MAX_DESCRIPTION = 500;

function readString(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw ApiError.badRequest(`"${field}" debe ser texto`, 'InvalidBody');
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw ApiError.badRequest(`"${field}" admite máximo ${max} caracteres`, 'InvalidBody');
  }
  return trimmed;
}

/** Forma pública de una API key: nunca incluye el hash. */
function publicKey(key: {
  id: string;
  name: string | null;
  keyPrefix: string;
  lastFour: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}) {
  return {
    id: key.id,
    name: key.name,
    preview: `${key.keyPrefix}…${key.lastFour}`,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
    active: key.revokedAt === null,
  };
}

const KEY_SELECT = {
  id: true,
  name: true,
  keyPrefix: true,
  lastFour: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
} satisfies Prisma.ApiKeySelect;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeys: ApiKeysService,
  ) {}

  // ---------- Proyectos ----------

  async createProject(input: ProjectInput) {
    const name = readString(input?.name, 'name', MAX_NAME);
    if (!name) throw ApiError.badRequest('"name" es obligatorio', 'InvalidBody');
    const description = readString(input?.description, 'description', MAX_DESCRIPTION);

    return this.prisma.project.create({
      data: { name, description: description || null },
    });
  }

  async listProjects() {
    const projects = await this.prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { apiKeys: { where: { revokedAt: null } } } } },
    });
    return projects.map(({ _count, ...project }) => ({
      ...project,
      activeKeys: _count.apiKeys,
    }));
  }

  async getProject(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { apiKeys: { select: KEY_SELECT, orderBy: { createdAt: 'desc' } } },
    });
    if (!project) throw ApiError.notFound('Proyecto no encontrado');
    return { ...project, apiKeys: project.apiKeys.map(publicKey) };
  }

  async updateProject(id: string, input: ProjectInput) {
    await this.ensureProject(id);

    const data: Prisma.ProjectUpdateInput = {};
    const name = readString(input?.name, 'name', MAX_NAME);
    if (name !== undefined) {
      if (!name) throw ApiError.badRequest('"name" no puede estar vacío', 'InvalidBody');
      data.name = name;
    }
    const description = readString(input?.description, 'description', MAX_DESCRIPTION);
    if (description !== undefined) data.description = description || null;
    if (input?.active !== undefined) {
      if (typeof input.active !== 'boolean') {
        throw ApiError.badRequest('"active" debe ser true o false', 'InvalidBody');
      }
      data.active = input.active;
    }

    const project = await this.prisma.project.update({ where: { id }, data });
    this.apiKeys.invalidateProject(id);
    return project;
  }

  async deleteProject(id: string) {
    await this.ensureProject(id);
    await this.prisma.project.delete({ where: { id } });
    this.apiKeys.invalidateProject(id);
    return { deleted: true, id };
  }

  // ---------- API keys ----------

  async createKey(projectId: string, name: unknown) {
    await this.ensureProject(projectId);
    const keyName = readString(name, 'name', MAX_NAME);
    const { record, rawKey } = await this.apiKeys.create(projectId, keyName);
    return {
      ...publicKey(record),
      apiKey: rawKey,
      warning: 'Guarda esta key ahora: no se volverá a mostrar.',
    };
  }

  async listKeys(projectId: string) {
    await this.ensureProject(projectId);
    const keys = await this.prisma.apiKey.findMany({
      where: { projectId },
      select: KEY_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return keys.map(publicKey);
  }

  async revokeKey(keyId: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id: keyId } });
    if (!key) throw ApiError.notFound('API key no encontrada');

    const updated = key.revokedAt
      ? key
      : await this.prisma.apiKey.update({
          where: { id: keyId },
          data: { revokedAt: new Date() },
        });
    this.apiKeys.invalidateKey(keyId);
    return publicKey(updated);
  }

  // ---------- Uso ----------

  async usage(projectId: string, daysParam: unknown) {
    await this.ensureProject(projectId);

    const parsed = Number.parseInt(String(daysParam ?? '30'), 10);
    const days = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 365) : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const tz = config.usageTimeZone;

    const rows = await this.prisma.$queryRaw<
      {
        day: string;
        service: string;
        profile: string;
        requests: number;
        successful: number;
        units: number;
        avgLatencyMs: number;
      }[]
    >`
      SELECT
        to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS "day",
        "service",
        "profile",
        COUNT(*)::int AS "requests",
        COUNT(*) FILTER (WHERE "status" < 400)::int AS "successful",
        COALESCE(SUM("units"), 0)::int AS "units",
        COALESCE(ROUND(AVG("latencyMs")), 0)::int AS "avgLatencyMs"
      FROM "RequestLog"
      WHERE "projectId" = ${projectId} AND "createdAt" >= ${since}
      GROUP BY 1, 2, 3
      ORDER BY 1 DESC, 2, 3
    `;

    const totals = rows.reduce(
      (acc, row) => ({
        requests: acc.requests + row.requests,
        successful: acc.successful + row.successful,
        units: acc.units + row.units,
      }),
      { requests: 0, successful: 0, units: 0 },
    );

    return { projectId, days, timeZone: tz, totals, daily: rows };
  }

  private async ensureProject(id: string): Promise<void> {
    const exists = await this.prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw ApiError.notFound('Proyecto no encontrado');
  }
}
