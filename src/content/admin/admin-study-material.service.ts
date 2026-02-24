import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ContentScope, Prisma } from '@prisma/client';
import { CreateAdminStudyMaterialDto, UpdateAdminStudyMaterialDto } from '../dto/admin-study-material.dto';

@Injectable()
export class AdminStudyMaterialService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateAdminStudyMaterialDto) {
    const content = await this.prisma.content.create({
      data: {
        title: dto.title,
        topic: dto.topic,
        content: dto.content,
        description: dto.description ?? null,
        userId,
        learningGuide: null,
        adminContent: {
          create: {
            createdBy: userId,
            scope:
              dto.scope === 'GLOBAL' ? ContentScope.GLOBAL : ContentScope.SCHOOL,
            schoolId: dto.scope === 'SCHOOL' ? dto.schoolId : null,
            isActive: dto.isActive ?? true,
            publishedAt: new Date(),
          },
        },
      },
      include: {
        adminContent: {
          include: {
            creator: { select: { id: true, name: true, email: true } },
            school: true,
          },
        },
      },
    });
    return content;
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    scope?: ContentScope,
    schoolId?: string,
    search?: string
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.AdminContentWhereInput = {};

    if (scope) where.scope = scope;
    if (schoolId) where.schoolId = schoolId;
    if (search?.trim()) {
      where.content = {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { topic: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.adminContent.findMany({
        where,
        include: {
          content: {
            select: {
              id: true,
              title: true,
              topic: true,
              description: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          creator: { select: { id: true, name: true, email: true } },
          school: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.adminContent.count({ where }),
    ]);

    return {
      data: items.map((ac) => ({
        id: ac.id,
        contentId: ac.contentId,
        title: ac.content.title,
        topic: ac.content.topic,
        description: ac.content.description,
        scope: ac.scope,
        schoolId: ac.schoolId,
        school: ac.school,
        isActive: ac.isActive,
        creator: ac.creator,
        createdAt: ac.createdAt,
        updatedAt: ac.updatedAt,
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
    const adminContent = await this.prisma.adminContent.findUnique({
      where: { id },
      include: {
        content: true,
        creator: { select: { id: true, name: true, email: true } },
        school: true,
      },
    });
    if (!adminContent) {
      throw new NotFoundException('Admin study material not found');
    }
    return adminContent;
  }

  async update(id: string, dto: UpdateAdminStudyMaterialDto) {
    const adminContent = await this.prisma.adminContent.findUnique({
      where: { id },
      include: { content: true },
    });
    if (!adminContent) {
      throw new NotFoundException('Admin study material not found');
    }

    const contentData: Prisma.ContentUpdateInput = {};
    if (dto.title !== undefined) contentData.title = dto.title;
    if (dto.topic !== undefined) contentData.topic = dto.topic;
    if (dto.content !== undefined) contentData.content = dto.content;
    if (dto.description !== undefined) contentData.description = dto.description;

    const adminData: Prisma.AdminContentUpdateInput = {};
    if (dto.scope !== undefined)
      adminData.scope =
        dto.scope === 'GLOBAL' ? ContentScope.GLOBAL : ContentScope.SCHOOL;
    if (dto.schoolId !== undefined) {
      adminData.school = dto.schoolId
        ? { connect: { id: dto.schoolId } }
        : { disconnect: true };
    }
    if (dto.isActive !== undefined) adminData.isActive = dto.isActive;

    if (Object.keys(contentData).length > 0) {
      await this.prisma.content.update({
        where: { id: adminContent.contentId },
        data: contentData,
      });
    }
    await this.prisma.adminContent.update({
      where: { id },
      data: adminData,
    });

    return this.findOne(id);
  }

  async remove(id: string) {
    const adminContent = await this.prisma.adminContent.findUnique({
      where: { id },
    });
    if (!adminContent) {
      throw new NotFoundException('Admin study material not found');
    }
    await this.prisma.content.delete({
      where: { id: adminContent.contentId },
    });
    return { success: true };
  }
}
