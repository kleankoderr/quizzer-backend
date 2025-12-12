import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStudyPackDto,
  UpdateStudyPackDto,
  MoveItemDto,
} from './dto/study-pack.dto';

@Injectable()
export class StudyPackService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {}

  private getListVersionKey(userId: string): string {
    return `study_packs:list_version:${userId}`;
  }

  private async getListVersion(userId: string): Promise<number> {
    const version = await this.cacheManager.get<number>(
      this.getListVersionKey(userId)
    );
    return version || 0;
  }

  private async incrementListVersion(userId: string): Promise<void> {
    const key = this.getListVersionKey(userId);
    const version = await this.getListVersion(userId);
    await this.cacheManager.set(key, version + 1, 0); // 0 = no expiry for version key (or long time)
  }

  async create(userId: string, createStudyPackDto: CreateStudyPackDto) {
    const created = await this.prisma.studyPack.create({
      data: {
        ...createStudyPackDto,
        userId,
      },
    });
    await this.incrementListVersion(userId);
    return created;
  }

  async findAll(userId: string, page: number = 1, limit: number = 10) {
    const version = await this.getListVersion(userId);
    const cacheKey = `study_packs:list:${userId}:${version}:${page}:${limit}`;

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return cached;
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.studyPack.findMany({
        where: { userId },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          coverImage: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              quizzes: true,
              flashcardSets: true,
              contents: true,
              userDocuments: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.studyPack.count({ where: { userId } }),
    ]);

    const result = {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.cacheManager.set(cacheKey, result, 60000); // Cache for 1 minute
    return result;
  }

  async findOne(id: string, userId: string) {
    const cacheKey = `study_packs:${id}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      // We need to verify ownership even if cached?
      // If we cache the whole object including userId, we can check.
      // But typically, cache key should handle security or we verify after.
      // Since ID is UUID, collision unlikely, but let's be safe.
      const pack = cached as any;
      if (pack.userId !== userId) {
        throw new NotFoundException('Study Pack not found');
      }
      return pack;
    }

    const studyPack = await this.prisma.studyPack.findUnique({
      where: { id },
      include: {
        quizzes: true,
        flashcardSets: true,
        contents: true,
        userDocuments: true,
      },
    });

    if (!studyPack) {
      throw new NotFoundException('Study Pack not found');
    }
    // Simple authorization check
    if (studyPack.userId !== userId) {
      // In a real app we might throw ForbiddenException or just NotFound
      throw new NotFoundException('Study Pack not found');
    }

    await this.cacheManager.set(cacheKey, studyPack, 300000); // 5 min
    return studyPack;
  }

  async update(
    id: string,
    userId: string,
    updateStudyPackDto: UpdateStudyPackDto
  ) {
    // Verify ownership first
    await this.findOne(id, userId);

    const updated = await this.prisma.studyPack.update({
      where: { id },
      data: updateStudyPackDto,
    });

    await this.cacheManager.del(`study_packs:${id}`);
    await this.incrementListVersion(userId);

    return updated;
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);

    const deleted = await this.prisma.studyPack.delete({
      where: { id },
    });

    await this.cacheManager.del(`study_packs:${id}`);
    await this.incrementListVersion(userId);

    return deleted;
  }

  async moveItem(id: string, userId: string, moveItemDto: MoveItemDto) {
    // Verify target study pack exists and belongs to user
    await this.findOne(id, userId);

    const { type, itemId } = moveItemDto;

    // We should also verify the item belongs to the user, but for now assuming valid IDs from frontend + backend ownership checks in those services would be better.
    // However, Prisma updateMany with userId clause is safe.

    let result;
    switch (type) {
      case 'quiz':
        result = await this.prisma.quiz.updateMany({
          where: { id: itemId, userId },
          data: { studyPackId: id },
        });
        break;
      case 'flashcard':
        result = await this.prisma.flashcardSet.updateMany({
          where: { id: itemId, userId },
          data: { studyPackId: id },
        });
        break;
      case 'content':
        result = await this.prisma.content.updateMany({
          where: { id: itemId, userId },
          data: { studyPackId: id },
        });
        break;
      case 'file':
        result = await this.prisma.userDocument.updateMany({
          where: { id: itemId, userId },
          data: { studyPackId: id },
        });
        break;
      default:
        throw new Error('Invalid item type');
    }

    await this.cacheManager.del(`study_packs:${id}`);
    await this.incrementListVersion(userId);

    return result;
  }

  async removeItem(id: string, userId: string, moveItemDto: MoveItemDto) {
    // Verify study pack exists and belongs to user
    await this.findOne(id, userId);

    const { type, itemId } = moveItemDto;

    let result;
    switch (type) {
      case 'quiz':
        result = await this.prisma.quiz.updateMany({
          where: { id: itemId, userId },
          data: { studyPackId: null },
        });
        break;
      case 'flashcard':
        result = await this.prisma.flashcardSet.updateMany({
          where: { id: itemId, userId },
          data: { studyPackId: null },
        });
        break;
      case 'content':
        result = await this.prisma.content.updateMany({
          where: { id: itemId, userId },
          data: { studyPackId: null },
        });
        break;
      case 'file':
        result = await this.prisma.userDocument.updateMany({
          where: { id: itemId, userId },
          data: { studyPackId: null },
        });
        break;
      default:
        throw new Error('Invalid item type');
    }

    await this.cacheManager.del(`study_packs:${id}`);
    await this.incrementListVersion(userId);

    return result;
  }

  async searchStudyPacks(userId: string, query: string) {
    const studyPacks = await this.prisma.studyPack.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 5,
    });

    return studyPacks.map((pack) => ({
      id: pack.id,
      title: pack.title,
      type: 'study-pack',
      metadata: pack.description || 'Study Pack',
      url: `/study-pack/${pack.id}`,
    }));
  }
}
