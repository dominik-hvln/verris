import { Injectable, Logger, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import * as dns from 'dns';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { DomainStatus } from '@verris/database';
import { CreateDomainDto } from './dto/create-domain.dto';

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async create(userId: string, createDomainDto: CreateDomainDto) {
    const existing = await this.prisma.domain.findUnique({
      where: { name: createDomainDto.name },
    });

    if (existing) {
      throw new ConflictException('Domena jest już zarejestrowana w systemie');
    }

    return this.prisma.domain.create({
      data: {
        name: createDomainDto.name,
        userId,
        status: DomainStatus.PENDING,
      },
    });
  }

  async findAllByUser(userId: string) {
    return this.prisma.domain.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const domain = await this.prisma.domain.findFirst({
      where: { id, userId },
    });

    if (!domain) {
      throw new NotFoundException(`Domena nie została znaleziona.`);
    }

    return domain;
  }

  async verifyDomain(id: string, userId: string) {
    const domain = await this.findOne(id, userId);
    
    if (domain.status === DomainStatus.ACTIVE) {
      return domain;
    }

    try {
      // Prosta weryfikacja DNS – szukamy rekordów NS lub jakichkolwiek A
      await dns.promises.resolveNs(domain.name).catch(() => dns.promises.resolve4(domain.name));
      
      // Jeśli udało się rozwiązać, zakładamy że domena działa i ustawiamy ACTIVE
      return this.prisma.domain.update({
        where: { id: domain.id },
        data: { status: DomainStatus.ACTIVE },
      });
    } catch (e) {
      // DNS resolution failed, wait for cron or user can try later
      return domain;
    }
  }

  async remove(id: string, userId: string) {
    const domain = await this.findOne(id, userId);

    return this.prisma.domain.delete({
      where: { id: domain.id },
    });
  }
}

