import {
  Injectable,
  NotFoundException,
  Inject,
  ConflictException,
  Logger,
} from '@nestjs/common';
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
  private readonly logger = new Logger(StudyPackService.name);
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
    const normalizedTitle = createStudyPackDto.title.trim();

    // Check for existing study pack with same title (case-insensitive)
    const existing = await this.prisma.studyPack.findFirst({
      where: {
        userId,
        title: {
          equals: normalizedTitle,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      throw new ConflictException('Study pack already exists');
    }

    const created = await this.prisma.studyPack.create({
      data: {
        ...createStudyPackDto,
        title: normalizedTitle,
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
    const cacheKey = `study_packs:${id}:${userId}`;
    const pack = await this.cacheManager.get(cacheKey);
    if (pack) return pack;

    const studyPack = await this.prisma.studyPack.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        title: true,
        description: true,
        coverImage: true,
        createdAt: true,
        updatedAt: true,
        quizzes: {
          select: {
            id: true,
            title: true,
            topic: true,
            difficulty: true,
            createdAt: true,
            updatedAt: true,
            tags: true,
            questions: true,
          },
        },
        flashcardSets: {
          select: {
            id: true,
            title: true,
            topic: true,
            createdAt: true,
            updatedAt: true,
            cards: true,
          },
        },
        contents: {
          select: {
            id: true,
            title: true,
            topic: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        userDocuments: {
          select: {
            id: true,
            displayName: true,
            uploadedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!studyPack) {
      throw new NotFoundException('Study Pack not found');
    }

    if (studyPack.userId !== userId) {
      throw new NotFoundException('Study Pack not found');
    }

    // Transform to add _count structure for frontend compatibility
    const transformedPack = {
      ...studyPack,
      quizzes: studyPack.quizzes.map((quiz) => {
        const questions = Array.isArray(quiz.questions)
          ? quiz.questions
          : JSON.parse(quiz.questions as string);

        return {
          id: quiz.id,
          title: quiz.title,
          topic: quiz.topic,
          difficulty: quiz.difficulty,
          createdAt: quiz.createdAt,
          updatedAt: quiz.updatedAt,
          tags: quiz.tags,
          _count: {
            questions: questions.length,
          },
        };
      }),
      flashcardSets: studyPack.flashcardSets.map((set) => {
        const cards = Array.isArray(set.cards)
          ? set.cards
          : JSON.parse(set.cards as string);

        return {
          id: set.id,
          title: set.title,
          topic: set.topic,
          createdAt: set.createdAt,
          updatedAt: set.updatedAt,
          _count: {
            cards: cards.length,
          },
        };
      }),
    };

    await this.cacheManager.set(cacheKey, transformedPack, 300000);
    return transformedPack;
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

    await this.cacheManager.del(`study_packs:${id}:${userId}`);
    await this.incrementListVersion(userId);

    return updated;
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);

    const deleted = await this.prisma.studyPack.delete({
      where: { id },
    });

    await this.cacheManager.del(`study_packs:${id}:${userId}`);
    await this.incrementListVersion(userId);

    return deleted;
  }

  async moveItem(id: string, userId: string, moveItemDto: MoveItemDto) {
    // Verify target study pack exists and belongs to user
    await this.findOne(id, userId);

    const { type, itemId } = moveItemDto;

    // We should also verify the item belongs to the user, but for now assuming valid IDs from frontend + backend ownership checks in those services would be better.
    // However, Prisma updateMany with userId clause is safe.

    // Find previous study pack ID to invalidate it
    let previousStudyPackId: string | null = null;
    try {
      if (type === 'quiz') {
        const item = await this.prisma.quiz.findUnique({
          where: { id: itemId },
          select: { studyPackId: true },
        });
        previousStudyPackId = item?.studyPackId;
      } else if (type === 'flashcard') {
        const item = await this.prisma.flashcardSet.findUnique({
          where: { id: itemId },
          select: { studyPackId: true },
        });
        previousStudyPackId = item?.studyPackId;
      } else if (type === 'content') {
        const item = await this.prisma.content.findUnique({
          where: { id: itemId },
          select: { studyPackId: true },
        });
        previousStudyPackId = item?.studyPackId;
      } else if (type === 'file') {
        const item = await this.prisma.userDocument.findUnique({
          where: { id: itemId },
          select: { studyPackId: true },
        });
        previousStudyPackId = item?.studyPackId;
      }
    } catch (e) {
      this.logger.error(e.message);
    }

    let result: { count: number };
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

    await this.cacheManager.del(`study_packs:${id}:${userId}`);
    if (previousStudyPackId && previousStudyPackId !== id) {
      await this.cacheManager.del(
        `study_packs:${previousStudyPackId}:${userId}`
      );
    }

    // Invalidate the specific entity list cache
    if (type === 'quiz') {
      await this.cacheManager.del(`quizzes:all:${userId}`);
    } else if (type === 'flashcard') {
      await this.cacheManager.del(`flashcards:all:${userId}`);
    } else if (type === 'content') {
      await this.cacheManager.del(`content:all:${userId}`);
    }

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

    await this.cacheManager.del(`study_packs:${id}:${userId}`);

    // Invalidate the specific entity list cache
    if (type === 'quiz') {
      await this.cacheManager.del(`quizzes:all:${userId}`);
    } else if (type === 'flashcard') {
      await this.cacheManager.del(`flashcards:all:${userId}`);
    } else if (type === 'content') {
      await this.cacheManager.del(`content:all:${userId}`);
    }

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
