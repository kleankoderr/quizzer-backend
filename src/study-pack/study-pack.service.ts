import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/services/cache.service';
import {
  CreateStudyPackDto,
  UpdateStudyPackDto,
  MoveItemDto,
} from './dto/study-pack.dto';
import { ContentScope, Prisma } from '@prisma/client';

@Injectable()
export class StudyPackService {
  private readonly logger = new Logger(StudyPackService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService
  ) {}

  private getListVersionKey(userId: string): string {
    return `study_packs:list_version:${userId}`;
  }

  private async getListVersion(userId: string): Promise<number> {
    const key = this.getListVersionKey(userId);
    const version = await this.cacheService.get<number>(key);
    if (version === undefined || version === null) {
      await this.cacheService.set(key, 1, 86400000);
      return 1;
    }
    return version;
  }

  private async incrementListVersion(userId: string): Promise<void> {
    const key = this.getListVersionKey(userId);
    const version = await this.getListVersion(userId);
    await this.cacheService.set(key, version + 1, 86400000);
  }

  async invalidateUserCache(userId: string): Promise<void> {
    await this.incrementListVersion(userId);
  }

  async create(userId: string, createStudyPackDto: CreateStudyPackDto) {
    const normalizedTitle = createStudyPackDto.title.trim();
    const normalizedDescription = createStudyPackDto.description?.trim();

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
        title: normalizedTitle,
        description: normalizedDescription,
        userId,
      },
    });
    await this.incrementListVersion(userId);
    return created;
  }

  private async getUserSchoolId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { schoolId: true },
    });
    return user?.schoolId ?? null;
  }

  private buildVisibleAdminPackFilter(userSchoolId: string | null) {
    const scopeCondition =
      userSchoolId !== null
        ? [
            { scope: 'GLOBAL' as ContentScope },
            { scope: 'SCHOOL' as ContentScope, schoolId: userSchoolId },
          ]
        : [{ scope: 'GLOBAL' as ContentScope }];
    return {
      isActive: true,
      OR: scopeCondition,
    };
  }

  async findAll(
    userId: string,
    page: number = 1,
    limit: number = 10,
    search?: string
  ) {
    const version = await this.getListVersion(userId);
    const cacheKey = `study_packs:list:${userId}:${version}:${page}:${limit}:${search || ''}`;

    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const userSchoolId = await this.getUserSchoolId(userId);
    const visibleAdminFilter = this.buildVisibleAdminPackFilter(userSchoolId);

    const where: any = {
      OR: [
        { userId },
        {
          adminStudyPack: visibleAdminFilter,
        },
      ],
    };
    if (search) {
      where.AND = [
        {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.prisma.studyPack.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          coverImage: true,
          createdAt: true,
          updatedAt: true,
          adminStudyPack: {
            select: { id: true, _count: { select: { items: true } } },
          },
          _count: {
            select: {
              quizzes: true,
              flashcardSets: true,
              contents: true,
              userDocuments: true,
            },
          },
        },
        orderBy: { title: 'asc' },
      }),
      this.prisma.studyPack.count({ where }),
    ]);

    const data = rows.map((pack) => {
      const { adminStudyPack, ...rest } = pack;
      const isAdmin = !!adminStudyPack;
      return {
        ...rest,
        isAdminPack: isAdmin,
        ...(isAdmin && adminStudyPack
          ? { itemCount: adminStudyPack._count.items, adminPackId: adminStudyPack.id }
          : {}),
      };
    });

    const result = {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.cacheService.set(cacheKey, result, 60000);
    return result;
  }

  async findOne(id: string, userId: string) {
    const cacheKey = `study_packs:${id}:${userId}`;
    const pack = await this.cacheService.get(cacheKey);
    if (pack) return pack;

    const userSchoolId = await this.getUserSchoolId(userId);

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
        adminStudyPack: {
          select: {
            id: true,
            isActive: true,
            scope: true,
            schoolId: true,
            items: {
              orderBy: { order: 'asc' },
              select: {
                adminQuiz: {
                  select: {
                    quiz: {
                      select: {
                        id: true,
                        title: true,
                        topic: true,
                        difficulty: true,
                        createdAt: true,
                        updatedAt: true,
                        tags: true,
                        questions: true,
                        _count: { select: { attempts: true } },
                      },
                    },
                  },
                },
                adminFlashcardSet: {
                  select: {
                    flashcardSet: {
                      select: {
                        id: true,
                        title: true,
                        topic: true,
                        createdAt: true,
                        updatedAt: true,
                        cards: true,
                        _count: { select: { attempts: true } },
                      },
                    },
                  },
                },
                adminContent: {
                  select: {
                    content: {
                      select: {
                        id: true,
                        title: true,
                        topic: true,
                        createdAt: true,
                        updatedAt: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
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
            _count: { select: { attempts: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        flashcardSets: {
          select: {
            id: true,
            title: true,
            topic: true,
            createdAt: true,
            updatedAt: true,
            cards: true,
            _count: { select: { attempts: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        contents: {
          select: {
            id: true,
            title: true,
            topic: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        userDocuments: {
          select: {
            id: true,
            displayName: true,
            uploadedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!studyPack) {
      throw new NotFoundException('Study Pack not found');
    }

    const isOwnPack = studyPack.userId === userId;
    const adminPack = studyPack.adminStudyPack;
    const isVisibleAdminPack =
      !!adminPack &&
      adminPack.isActive &&
      (adminPack.scope === 'GLOBAL' ||
        (adminPack.scope === 'SCHOOL' && adminPack.schoolId === userSchoolId));

    if (!isOwnPack && !isVisibleAdminPack) {
      throw new NotFoundException('Study Pack not found');
    }

    let quizzes: any[];
    let flashcardSets: any[];
    let contents: any[];

    if (isVisibleAdminPack && adminPack) {
      const items = adminPack.items;
      quizzes = items
        .filter((i) => i.adminQuiz?.quiz)
        .map((i) => {
          const quiz = i.adminQuiz!.quiz;
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
              attempts: quiz._count.attempts,
            },
          };
        });
      flashcardSets = items
        .filter((i) => i.adminFlashcardSet?.flashcardSet)
        .map((i) => {
          const set = i.adminFlashcardSet!.flashcardSet;
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
              attempts: set._count.attempts,
            },
          };
        });
      contents = items
        .filter((i) => i.adminContent?.content)
        .map((i) => ({
          id: i.adminContent!.content.id,
          title: i.adminContent!.content.title,
          topic: i.adminContent!.content.topic,
          createdAt: i.adminContent!.content.createdAt,
          updatedAt: i.adminContent!.content.updatedAt,
        }));
    } else {
      quizzes = (studyPack.quizzes ?? []).map((quiz) => {
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
            attempts: quiz._count.attempts,
          },
        };
      });
      flashcardSets = (studyPack.flashcardSets ?? []).map((set) => {
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
            attempts: set._count.attempts,
          },
        };
      });
      contents = studyPack.contents ?? [];
    }

    const transformedPack = {
      id: studyPack.id,
      userId: studyPack.userId,
      title: studyPack.title,
      description: studyPack.description,
      coverImage: studyPack.coverImage,
      createdAt: studyPack.createdAt,
      updatedAt: studyPack.updatedAt,
      isAdminPack: !!isVisibleAdminPack,
      ...(isVisibleAdminPack && adminPack
        ? {
            adminPackId: adminPack.id,
            scope: adminPack.scope,
            schoolId: adminPack.schoolId ?? null,
            isActive: adminPack.isActive,
          }
        : {}),
      quizzes,
      flashcardSets,
      contents,
      userDocuments: studyPack.userDocuments ?? [],
    };

    await this.cacheService.set(cacheKey, transformedPack, 300000);
    return transformedPack;
  }

  async update(
    id: string,
    userId: string,
    updateStudyPackDto: UpdateStudyPackDto
  ) {
    const pack = await this.findOne(id, userId) as { isAdminPack?: boolean };
    if (pack.isAdminPack) {
      throw new ForbiddenException('Cannot edit an admin-created study pack');
    }

    const updated = await this.prisma.studyPack.update({
      where: { id },
      data: updateStudyPackDto,
    });

    await this.cacheService.invalidate(`study_packs:${id}:${userId}`);
    await this.incrementListVersion(userId);

    return updated;
  }

  async remove(id: string, userId: string) {
    const pack = await this.findOne(id, userId) as { isAdminPack?: boolean };
    if (pack.isAdminPack) {
      throw new ForbiddenException('Cannot delete an admin-created study pack');
    }

    const deleted = await this.prisma.studyPack.delete({
      where: { id },
    });

    await this.cacheService.invalidate(`study_packs:${id}:${userId}`);
    await this.incrementListVersion(userId);

    return deleted;
  }

  async moveItem(id: string, userId: string, moveItemDto: MoveItemDto) {
    const pack = await this.findOne(id, userId) as { isAdminPack?: boolean };
    if (pack.isAdminPack) {
      throw new ForbiddenException(
        'Cannot move items in an admin-created study pack'
      );
    }
    const { type, itemId } = moveItemDto;

    // Find previous study pack ID to invalidate it
    let previousStudyPackId: string | null = null;
    try {
      if (type === 'quiz') {
        const item = await this.prisma.quiz.findUnique({
          where: { id: itemId, userId },
          select: { studyPackId: true },
        });
        previousStudyPackId = item?.studyPackId;
      } else if (type === 'flashcard') {
        const item = await this.prisma.flashcardSet.findUnique({
          where: { id: itemId, userId },
          select: { studyPackId: true },
        });
        previousStudyPackId = item?.studyPackId;
      } else if (type === 'content') {
        const item = await this.prisma.content.findUnique({
          where: { id: itemId, userId },
          select: { studyPackId: true },
        });
        previousStudyPackId = item?.studyPackId;
      } else if (type === 'file') {
        const item = await this.prisma.userDocument.findUnique({
          where: { id: itemId, userId },
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

    // Non-blocking cache invalidation
    try {
      await this.cacheService.invalidate(`study_packs:${id}:${userId}`);
      if (previousStudyPackId && previousStudyPackId !== id) {
        await this.cacheService.invalidate(
          `study_packs:${previousStudyPackId}:${userId}`
        );
      }

      if (type === 'quiz') {
        await this.cacheService.invalidate(`quiz:${itemId}:${userId}`);
      } else if (type === 'flashcard') {
        await this.cacheService.invalidate(`flashcardSet:${itemId}:${userId}`);
      } else if (type === 'content') {
        await this.cacheService.invalidate(`content:${itemId}:${userId}`);
      }

      await this.incrementListVersion(userId);
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate cache after move: ${error.message}`
      );
    }

    return result;
  }

  async removeItem(id: string, userId: string, moveItemDto: MoveItemDto) {
    const pack = await this.findOne(id, userId) as { isAdminPack?: boolean };
    if (pack.isAdminPack) {
      throw new ForbiddenException(
        'Cannot remove items from an admin-created study pack'
      );
    }

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

    // Non-blocking cache invalidation
    try {
      await this.cacheService.invalidate(`study_packs:${id}:${userId}`);
      await this.incrementListVersion(userId);
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate cache after remove: ${error.message}`
      );
    }

    return result;
  }

  async searchStudyPacks(userId: string, query: string) {
    const userSchoolId = await this.getUserSchoolId(userId);
    const visibleAdminFilter = this.buildVisibleAdminPackFilter(userSchoolId);
    const searchCondition: Prisma.StudyPackWhereInput[] = [
      { title: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
    ];
    const studyPacks = await this.prisma.studyPack.findMany({
      where: {
        OR: [
          {
            userId,
            OR: searchCondition,
          },
          {
            adminStudyPack: visibleAdminFilter,
            OR: searchCondition,
          },
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
