import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll() {
    return this.prisma.entitlement.findMany({
      include: {
        plans: {
          include: {
            plan: true,
          },
        },
      },
      orderBy: { key: 'asc' },
    });
  }

  async getByKey(key: string) {
    const entitlement = await this.prisma.entitlement.findUnique({
      where: { key },
    });
    if (!entitlement)
      throw new NotFoundException(`Entitlement ${key} not found`);
    return entitlement;
  }

  async create(data: {
    key: string;
    name: string;
    description?: string;
    type?: any;
  }) {
    return this.prisma.entitlement.create({
      data,
    });
  }
}
