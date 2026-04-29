import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IncidentStatus,
  Prisma,
  ProbeIncident,
  ProbeKind,
  ProbeSeverity,
  ServiceProbe,
} from '@ekohost/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreateProbeDto, UpdateIncidentDto, UpdateProbeDto } from './dto/probe.dto';
import { StatusService } from './status.service';

@Injectable()
export class ProbesAdminService {
  private readonly logger = new Logger(ProbesAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly status: StatusService,
  ) {}

  async list(filters: { serverId?: string }): Promise<ServiceProbe[]> {
    return this.prisma.serviceProbe.findMany({
      where: filters.serverId ? { serverId: filters.serverId } : undefined,
      orderBy: [{ serverId: 'asc' }, { kind: 'asc' }],
    });
  }

  async create(dto: CreateProbeDto, actorUserId: string): Promise<ServiceProbe> {
    const server = await this.prisma.server.findUnique({ where: { id: dto.serverId } });
    if (!server) throw new NotFoundException('Server not found');

    try {
      const probe = await this.prisma.serviceProbe.create({
        data: {
          serverId: dto.serverId,
          kind: dto.kind,
          target: dto.target,
          label: dto.label ?? null,
          severity: dto.severity ?? defaultSeverityFor(dto.kind),
          declaredSlaPct: dto.declaredSlaPct ?? 99.9,
          isEnabled: dto.isEnabled ?? true,
          isPublic: dto.isPublic ?? true,
        },
      });
      await this.audit.record({
        action: 'PROBE_CREATED',
        actorUserId,
        details: {
          probeId: probe.id,
          serverId: probe.serverId,
          kind: probe.kind,
          target: probe.target,
          severity: probe.severity,
        },
      });
      this.status.invalidate();
      return probe;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Probe with this kind+target already exists for this server');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateProbeDto, actorUserId: string): Promise<ServiceProbe> {
    await this.getById(id);
    const updated = await this.prisma.serviceProbe.update({
      where: { id },
      data: {
        target: dto.target,
        label: dto.label,
        severity: dto.severity,
        declaredSlaPct: dto.declaredSlaPct,
        isEnabled: dto.isEnabled,
        isPublic: dto.isPublic,
      },
    });
    await this.audit.record({
      action: 'PROBE_UPDATED',
      actorUserId,
      details: { probeId: id, changes: { ...dto } },
    });
    this.status.invalidate();
    return updated;
  }

  async remove(id: string, actorUserId: string): Promise<void> {
    await this.getById(id);
    await this.prisma.serviceProbe.delete({ where: { id } });
    await this.audit.record({
      action: 'PROBE_DELETED',
      actorUserId,
      details: { probeId: id },
    });
    this.status.invalidate();
  }

  async listIncidents(filters: {
    serverId?: string;
    status?: IncidentStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ rows: ProbeIncident[]; total: number }> {
    const where: Prisma.ProbeIncidentWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.serverId) where.probe = { serverId: filters.serverId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.probeIncident.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: Math.min(filters.limit ?? 50, 200),
        skip: Math.max(filters.offset ?? 0, 0),
        include: {
          probe: { include: { server: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.probeIncident.count({ where }),
    ]);
    return { rows, total };
  }

  async updateIncident(
    id: string,
    dto: UpdateIncidentDto,
    actorUserId: string,
  ): Promise<ProbeIncident> {
    const incident = await this.prisma.probeIncident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('Incident not found');
    const updated = await this.prisma.probeIncident.update({
      where: { id },
      data: { title: dto.title, publicMessage: dto.publicMessage },
    });
    await this.audit.record({
      action: 'PROBE_INCIDENT_EDITED',
      actorUserId,
      details: { incidentId: id, changes: { ...dto } },
    });
    this.status.invalidate();
    return updated;
  }

  async iterateIncidents(filters: {
    serverId?: string;
    from?: Date;
    to?: Date;
  }): Promise<
    AsyncIterable<
      ProbeIncident & {
        probe: ServiceProbe & { server: { id: string; name: string | null } };
      }
    >
  > {
    const where: Prisma.ProbeIncidentWhereInput = {};
    if (filters.serverId) where.probe = { serverId: filters.serverId };
    if (filters.from || filters.to) {
      where.startedAt = {
        gte: filters.from,
        lte: filters.to,
      };
    }

    const prisma = this.prisma;
    async function* iterate() {
      let cursor: string | null = null;
      while (true) {
        const batch = await prisma.probeIncident.findMany({
          where,
          take: 200,
          orderBy: { startedAt: 'asc' },
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          include: { probe: { include: { server: { select: { id: true, name: true } } } } },
        });
        if (batch.length === 0) return;
        for (const row of batch) yield row;
        if (batch.length < 200) return;
        cursor = batch[batch.length - 1].id;
      }
    }
    return iterate();
  }

  private async getById(id: string): Promise<ServiceProbe> {
    const probe = await this.prisma.serviceProbe.findUnique({ where: { id } });
    if (!probe) throw new NotFoundException('Probe not found');
    return probe;
  }
}

function defaultSeverityFor(kind: ProbeKind): ProbeSeverity {
  switch (kind) {
    case ProbeKind.HTTP:
    case ProbeKind.HTTPS:
    case ProbeKind.MYSQL:
    case ProbeKind.DA_API:
      return ProbeSeverity.MAJOR;
    case ProbeKind.SMTP:
    case ProbeKind.IMAP:
    case ProbeKind.POP3:
    case ProbeKind.SSH:
    case ProbeKind.DNS:
    default:
      return ProbeSeverity.MINOR;
  }
}
