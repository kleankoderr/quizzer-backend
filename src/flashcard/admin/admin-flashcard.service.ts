import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ContentScope, Prisma } from '@prisma/client';
import { CreateAdminFlashcardDto, UpdateAdminFlashcardDto } from './dto/admin-flashcard.dto';
import { FlashcardService } from '../flashcard.service';

@Injectable()
export class AdminFlashcardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flashcardService: FlashcardService
  ) {}

  async createAdminFlashcardSet(
    userId: string,
    dto: CreateAdminFlashcardDto,
    files?: Express.Multer.File[]
  ) {
    const adminContext = {
      scope: dto.scope,
      schoolId: dto.schoolId,
      isActive: dto.isActive ?? true,
    };
    return this.flashcardService.generateFlashcards(userId, dto, files, adminContext);
  }

  async findAllAdminFlashcardSets(
    page: number = 1,
    limit: number = 20,
    scope?: ContentScope,
    schoolId?: string,
    search?: string
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.AdminFlashcardSetWhereInput = {};

    if (scope) where.scope = scope;
    if (schoolId) where.schoolId = schoolId;
    if (search?.trim()) {
      where.flashcardSet = {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { topic: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.adminFlashcardSet.findMany({
        where,
        include: {
          flashcardSet: {
            select: {
              id: true,
              title: true,
              topic: true,
              cards: true,
              createdAt: true,
              _count: { select: { attempts: true } },
            },
          },
          creator: { select: { name: true, email: true } },
          school: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.adminFlashcardSet.count({ where }),
    ]);

    return {
      data: items.map((afs) => {
        const cards = Array.isArray(afs.flashcardSet.cards) ? afs.flashcardSet.cards : [];
        return {
          id: afs.id,
          flashcardSetId: afs.flashcardSetId,
          title: afs.flashcardSet.title,
          topic: afs.flashcardSet.topic,
          cardCount: cards.length,
          scope: afs.scope,
          schoolId: afs.schoolId,
          school: afs.school,
          isActive: afs.isActive,
          attemptCount: afs.flashcardSet._count.attempts,
          _count: { attempts: afs.flashcardSet._count.attempts },
          createdAt: afs.createdAt,
          user: afs.creator ? { name: afs.creator.name, email: afs.creator.email } : undefined,
        };
      }),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAdminFlashcardSetById(id: string) {
    const adminSet = await this.prisma.adminFlashcardSet.findUnique({
      where: { id },
      include: {
        flashcardSet: true,
        creator: { select: { id: true, name: true, email: true } },
        school: { select: { id: true, name: true } },
      },
    });

    if (!adminSet) {
      throw new NotFoundException('Admin flashcard set not found');
    }

    return adminSet;
  }

  async updateAdminFlashcardSet(id: string, dto: UpdateAdminFlashcardDto) {
    const adminSet = await this.prisma.adminFlashcardSet.findUnique({
      where: { id },
    });
    if (!adminSet) throw new NotFoundException('Admin flashcard set not found');

    const updateData: Prisma.AdminFlashcardSetUpdateInput = {};
    if (dto.scope !== undefined) updateData.scope = dto.scope;
    if (dto.schoolId !== undefined) {
      updateData.school = dto.schoolId
        ? { connect: { id: dto.schoolId } }
        : { disconnect: true };
    }
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    return this.prisma.adminFlashcardSet.update({
      where: { id },
      data: updateData,
      include: {
        flashcardSet: true,
        creator: { select: { id: true, name: true, email: true } },
        school: { select: { id: true, name: true } },
      },
    });
  }

  async deleteAdminFlashcardSet(id: string) {
    const adminSet = await this.prisma.adminFlashcardSet.findUnique({
      where: { id },
    });
    if (!adminSet) throw new NotFoundException('Admin flashcard set not found');

    await this.prisma.adminFlashcardSet.delete({ where: { id } });
    await this.prisma.flashcardSet.delete({ where: { id: adminSet.flashcardSetId } });
    return { deleted: true };
  }
}
