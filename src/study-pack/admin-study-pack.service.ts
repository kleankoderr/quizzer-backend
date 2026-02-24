import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContentScope, Prisma } from '@prisma/client';
import { CreateAdminStudyPackDto, UpdateAdminStudyPackDto } from './dto/admin-study-pack.dto';

@Injectable()
export class AdminStudyPackService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    page: number = 1,
    limit: number = 20,
    scope?: ContentScope,
    schoolId?: string,
    search?: string
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.AdminStudyPackWhereInput = {};

    if (scope) where.scope = scope;
    if (schoolId) where.schoolId = schoolId;
    if (search?.trim()) {
      where.studyPack = {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.adminStudyPack.findMany({
        where,
        include: {
          studyPack: {
            select: {
              id: true,
              title: true,
              description: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          creator: { select: { id: true, name: true, email: true } },
          school: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.adminStudyPack.count({ where }),
    ]);

    return {
      data: items.map((asp) => ({
        id: asp.id,
        studyPackId: asp.studyPackId,
        title: asp.studyPack.title,
        description: asp.studyPack.description,
        scope: asp.scope,
        schoolId: asp.schoolId,
        school: asp.school,
        isActive: asp.isActive,
        itemCount: asp._count.items,
        createdAt: asp.createdAt,
        updatedAt: asp.updatedAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const adminPack = await this.prisma.adminStudyPack.findUnique({
      where: { id },
      include: {
        studyPack: {
          select: {
            id: true,
            title: true,
            description: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        creator: { select: { id: true, name: true, email: true } },
        school: { select: { id: true, name: true } },
        items: {
          orderBy: { order: 'asc' },
          include: {
            adminQuiz: {
              select: {
                id: true,
                quizId: true,
                quiz: { select: { title: true, topic: true } },
              },
            },
            adminFlashcardSet: {
              select: {
                id: true,
                flashcardSetId: true,
                flashcardSet: { select: { title: true, topic: true } },
              },
            },
            adminContent: {
              select: {
                id: true,
                contentId: true,
                content: { select: { title: true, topic: true } },
              },
            },
          },
        },
      },
    });

    if (!adminPack) {
      throw new NotFoundException('Admin study pack not found');
    }

    return {
      id: adminPack.id,
      studyPackId: adminPack.studyPackId,
      title: adminPack.studyPack.title,
      description: adminPack.studyPack.description,
      scope: adminPack.scope,
      schoolId: adminPack.schoolId,
      school: adminPack.school,
      isActive: adminPack.isActive,
      createdAt: adminPack.createdAt,
      updatedAt: adminPack.updatedAt,
      items: adminPack.items,
    };
  }

  async create(userId: string, dto: CreateAdminStudyPackDto) {
    const title = dto.title.trim();
    const description = dto.description?.trim() ?? null;

    const studyPack = await this.prisma.studyPack.create({
      data: {
        title,
        description,
        userId,
      },
    });

    const adminPack = await this.prisma.adminStudyPack.create({
      data: {
        studyPackId: studyPack.id,
        createdBy: userId,
        scope: dto.scope as ContentScope,
        schoolId: dto.scope === 'SCHOOL' ? dto.schoolId ?? null : null,
        isActive: dto.isActive ?? true,
      },
      include: {
        studyPack: { select: { id: true, title: true, description: true } },
        school: { select: { id: true, name: true } },
      },
    });

    return adminPack;
  }

  async update(id: string, dto: UpdateAdminStudyPackDto) {
    const adminPack = await this.prisma.adminStudyPack.findUnique({
      where: { id },
      include: { studyPack: true },
    });

    if (!adminPack) {
      throw new NotFoundException('Admin study pack not found');
    }

    const studyPackUpdates: { title?: string; description?: string | null } = {};
    if (dto.title !== undefined) studyPackUpdates.title = dto.title.trim();
    if (dto.description !== undefined) studyPackUpdates.description = dto.description?.trim() ?? null;

    const adminPackUpdates: {
      scope?: ContentScope;
      schoolId?: string | null;
      isActive?: boolean;
    } = {};
    if (dto.scope !== undefined) adminPackUpdates.scope = dto.scope as ContentScope;
    if (dto.schoolId !== undefined) adminPackUpdates.schoolId = dto.schoolId || null;
    if (dto.isActive !== undefined) adminPackUpdates.isActive = dto.isActive;

    await this.prisma.$transaction([
      ...(Object.keys(studyPackUpdates).length > 0
        ? [
            this.prisma.studyPack.update({
              where: { id: adminPack.studyPackId },
              data: studyPackUpdates,
            }),
          ]
        : []),
      ...(Object.keys(adminPackUpdates).length > 0
        ? [
            this.prisma.adminStudyPack.update({
              where: { id },
              data: adminPackUpdates,
            }),
          ]
        : []),
    ]);

    return this.findOne(id);
  }

  async remove(id: string) {
    const adminPack = await this.prisma.adminStudyPack.findUnique({
      where: { id },
    });

    if (!adminPack) {
      throw new NotFoundException('Admin study pack not found');
    }

    await this.prisma.adminStudyPack.delete({ where: { id } });
    await this.prisma.studyPack.delete({ where: { id: adminPack.studyPackId } });
    return { deleted: true };
  }
}
