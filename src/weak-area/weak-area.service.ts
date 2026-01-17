import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import {
  QuizGenerationSchema,
  ConceptListSchema,
} from '../langchain/schemas/quiz.schema';
import { AiPrompts } from '../ai/ai.prompts';

@Injectable()
export class WeakAreaService {
  private readonly logger = new Logger(WeakAreaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly langchainService: LangChainService
  ) {}

  /**
   * Generate a practice quiz focused on user's weak areas
   */
  async generatePracticeQuiz(userId: string, weakAreaId: string) {
    try {
      const weakArea = await this.prisma.weakArea.findUnique({
        where: { id: weakAreaId },
      });

      if (!weakArea) {
        throw new Error('Weak area not found');
      }

      // Generate quiz using LangChain
      const prompt = AiPrompts.generateQuiz(
        weakArea.topic,
        5,
        'medium',
        'standard',
        'single-select',
        ''
      );

      const generatedQuiz = await this.langchainService.invokeWithStructure(
        QuizGenerationSchema,
        prompt,
        {
          task: 'quiz',
          complexity: 'simple',
        }
      );

      // Save quiz to DB
      const quiz = await this.prisma.quiz.create({
        data: {
          title: `Practice: ${weakArea.topic} - ${weakArea.concept}`,
          topic: weakArea.topic,
          difficulty: 'medium',
          quizType: 'STANDARD',
          userId,
          questions: generatedQuiz.questions.map((q: any) => ({
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            difficulty: q.difficulty || 'medium',
          })),
        },
      });

      return quiz;
    } catch (error) {
      this.logger.error('Error generating practice quiz:', error);
      throw error;
    }
  }

  /**
   * Extract concepts from questions using AI
   */
  async extractConceptsFromQuestions(
    questions: { question: string }[],
    _topic: string
  ): Promise<string[]> {
    if (questions.length === 0) return [];

    try {
      const prompt = AiPrompts.extractConceptsFromQuestions(
        questions.map((q) => q.question)
      );
      const concepts = await this.langchainService.invokeWithStructure(
        ConceptListSchema,
        prompt,
        {
          task: 'concept_extraction',
          complexity: 'simple',
        }
      );

      if (Array.isArray(concepts)) {
        return concepts.map((c) => c.substring(0, 100));
      }
      return questions.map((q) => q.question.substring(0, 100));
    } catch (error) {
      this.logger.error('Error extracting concepts:', error);
      return questions.map((q) => q.question.substring(0, 100));
    }
  }

  /**
   * Get weak areas for a user
   */
  async getWeakAreas(userId: string, resolved: boolean = false) {
    return this.prisma.weakArea.findMany({
      where: {
        userId,
        resolved,
      },
      orderBy: { lastErrorAt: 'desc' },
    });
  }

  /**
   * Get stats for weak areas
   */
  async getWeakAreaStats(userId: string) {
    const [total, resolved] = await Promise.all([
      this.prisma.weakArea.count({
        where: { userId },
      }),
      this.prisma.weakArea.count({
        where: { userId, resolved: true },
      }),
    ]);

    return {
      total,
      resolved,
      pending: total - resolved,
      resolutionRate: total > 0 ? (resolved / total) * 100 : 0,
    };
  }

  /**
   * Mark a weak area as resolved
   */
  async resolveWeakArea(userId: string, id: string) {
    return this.prisma.weakArea.updateMany({
      where: {
        id,
        userId,
      },
      data: {
        resolved: true,
      },
    });
  }
}
