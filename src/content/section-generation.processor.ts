import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import { LangChainPrompts } from '../langchain/prompts';
import { EventFactory, EVENTS } from '../events/events.types';

export interface SectionJobData {
  contentId: string;
  userId: string;
  topic: string;
  sections: Array<{ title: string; keywords?: string[] }>;
  sourceContent: string;
}

@Injectable()
@Processor('section-generation')
export class SectionGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(SectionGenerationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly langchainService: LangChainService,
    private readonly eventEmitter: EventEmitter2
  ) {
    super();
  }

  async process(job: Job<SectionJobData>): Promise<any> {
    const { contentId, userId, topic, sections, sourceContent } = job.data;
    const jobId = job.id?.toString() || 'unknown';

    this.logger.log(
      `Job ${jobId}: Starting section generation for content ${contentId} - ${sections.length} sections`
    );

    try {
      // Generate each section progressively
      for (let i = 0; i < sections.length; i++) {
        await this.generateSection(
          contentId,
          userId,
          i,
          sections[i],
          topic,
          sourceContent
        );

        // Update job progress
        const progress = Math.round(((i + 1) / sections.length) * 100);
        await job.updateProgress(progress);
      }

      // Emit all sections completed event
      this.eventEmitter.emit(
        EVENTS.LEARNING_GUIDE.ALL_SECTIONS_COMPLETED,
        EventFactory.learningGuideAllSectionsCompleted(
          userId,
          contentId,
          sections.length
        )
      );

      this.logger.log(
        `Job ${jobId}: Completed all ${sections.length} sections for content ${contentId}`
      );

      return { success: true, sectionsGenerated: sections.length };
    } catch (error) {
      this.logger.error(
        `Job ${jobId}: Failed to generate sections: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  private async generateSection(
    contentId: string,
    userId: string,
    sectionIndex: number,
    section: { title: string; keywords?: string[] },
    topic: string,
    sourceContent: string
  ): Promise<void> {
    const { title, keywords = [] } = section;

    this.logger.log(
      `Content ${contentId}: Starting section ${sectionIndex + 1} - "${title}"`
    );

    // Emit section started event
    this.eventEmitter.emit(
      EVENTS.LEARNING_GUIDE.SECTION_STARTED,
      EventFactory.learningGuideSectionStarted(
        userId,
        contentId,
        sectionIndex,
        title
      )
    );

    try {
      // Generate section content prompt
      const prompt = LangChainPrompts.generateSectionContent(
        title,
        keywords,
        topic,
        sourceContent
      );

      // Use invokeWithJsonParser for reliable JSON parsing
      // (streaming was causing incomplete/truncated responses)
      const parsed = await this.langchainService.invokeWithJsonParser(prompt, {
        task: 'section-generation',
        userId,
      });

      const sectionData = {
        content: parsed.content || '',
        example: parsed.example || '',
        knowledgeCheck: parsed.knowledgeCheck || null,
      };

      // Update the section in the database
      await this.updateSectionContent(contentId, sectionIndex, sectionData);

      // Emit section completed event
      this.eventEmitter.emit(
        EVENTS.LEARNING_GUIDE.SECTION_COMPLETED,
        EventFactory.learningGuideSectionCompleted(
          userId,
          contentId,
          sectionIndex
        )
      );

      this.logger.log(
        `Content ${contentId}: Completed section ${sectionIndex + 1} - "${title}"`
      );
    } catch (error) {
      this.logger.error(
        `Content ${contentId}: Failed to generate section ${sectionIndex + 1}: ${error.message}`
      );
      throw error;
    }
  }

  private async updateSectionContent(
    contentId: string,
    sectionIndex: number,
    sectionData: { content: string; example: string; knowledgeCheck: any }
  ): Promise<void> {
    // Fetch current content
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
      select: { learningGuide: true },
    });

    if (!content?.learningGuide) {
      throw new Error(
        `Content ${contentId} not found or has no learning guide`
      );
    }

    const learningGuide = content.learningGuide as any;
    const sections = learningGuide.sections || [];

    // Update the specific section
    sections[sectionIndex] = {
      ...sections[sectionIndex],
      ...sectionData,
    };

    // Save back to database
    await this.prisma.content.update({
      where: { id: contentId },
      data: {
        learningGuide: {
          ...learningGuide,
          sections,
        },
      },
    });
  }
}
