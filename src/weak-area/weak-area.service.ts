import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import { AiService } from '../ai/ai.service';

export interface WeakAreaStats {
  totalWeakAreas: number;
  totalErrors: number;
  byTopic: {
    topic: string;
    count: number;
    totalErrors: number;
    concepts: string[];
  }[];
}

@Injectable()
export class WeakAreaService {
  private readonly logger = new Logger(WeakAreaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly langchainService: LangChainService,
    private readonly aiService: AiService,
  ) {}

  /**
   * Get weak areas for a user
   */
  async getWeakAreas(userId: string, resolved: boolean = false) {
    this.logger.log(
      `Getting weak areas for user ${userId}, resolved: ${resolved}`
    );

    return this.prisma.weakArea.findMany({
      where: { userId, resolved },
      orderBy: [{ errorCount: 'desc' }, { lastErrorAt: 'desc' }],
    });
  }

  /**
   * Mark weak area as resolved
   */
  async resolveWeakArea(userId: string, weakAreaId: string) {
    this.logger.log(`Resolving weak area ${weakAreaId} for user ${userId}`);

    // Verify ownership
    const weakArea = await this.prisma.weakArea.findUnique({
      where: { id: weakAreaId },
    });

    if (!weakArea) {
      throw new NotFoundException('Weak area not found');
    }

    if (weakArea.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to modify this weak area'
      );
    }

    return this.prisma.weakArea.update({
      where: { id: weakAreaId },
      data: { resolved: true },
    });
  }

  /**
   * Get weak area statistics grouped by topic
   */
  async getWeakAreaStats(userId: string): Promise<WeakAreaStats> {
    this.logger.log(`Getting weak area statistics for user ${userId}`);

    const weakAreas = await this.prisma.weakArea.findMany({
      where: { userId, resolved: false },
    });

    // Group by topic
    const topicMap = new Map<
      string,
      {
        count: number;
        totalErrors: number;
        concepts: string[];
      }
    >();

    let totalErrors = 0;

    for (const weakArea of weakAreas) {
      totalErrors += weakArea.errorCount;

      if (!topicMap.has(weakArea.topic)) {
        topicMap.set(weakArea.topic, {
          count: 0,
          totalErrors: 0,
          concepts: [],
        });
      }

      const topicStats = topicMap.get(weakArea.topic);
      topicStats.count += 1;
      topicStats.totalErrors += weakArea.errorCount;
      topicStats.concepts.push(weakArea.concept);
    }

    // Convert map to array
    const byTopic = Array.from(topicMap.entries())
      .map(([topic, stats]) => ({
        topic,
        ...stats,
      }))
      .sort((a, b) => b.totalErrors - a.totalErrors);

    return {
      totalWeakAreas: weakAreas.length,
      totalErrors,
      byTopic,
    };
  }

  /**
   * Generate practice quiz for a specific weak area (Premium feature)
   */
  async generatePracticeQuiz(userId: string, weakAreaId: string) {
    this.logger.log(
      `Generating practice quiz for weak area ${weakAreaId}, user ${userId}`
    );

    // Verify ownership and get weak area
    const weakArea = await this.prisma.weakArea.findUnique({
      where: { id: weakAreaId },
    });

    if (!weakArea) {
      throw new NotFoundException('Weak area not found');
    }

    if (weakArea.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this weak area'
      );
    }

    // Generate quiz focused on this specific concept
    const prompt = `Generate 5 targeted practice questions about "${weakArea.concept}" within the topic of "${weakArea.topic}". 
    Focus on helping the user master this specific concept they've struggled with.`;

    const quizResponse = await this.aiService.generateQuiz({
      topic: weakArea.topic,
      content: prompt,
      numberOfQuestions: 5,
      difficulty: 'medium',
      quizType: 'standard',
    });

    // Create quiz
    const quiz = await this.prisma.quiz.create({
      data: {
        title: quizResponse.title || `Practice: ${weakArea.concept}`,
        topic: quizResponse.topic || weakArea.topic,
        difficulty: 'medium',
        quizType: 'STANDARD',
        questions: quizResponse.questions as any, // Cast to JSON format for Prisma
        userId: userId,
        sourceType: 'weak-area',
      },
    });

    this.logger.log(
      `Created practice quiz ${quiz.id} for weak area ${weakAreaId}`
    );

    return quiz;
  }
}
