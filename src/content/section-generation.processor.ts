import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { LangChainService } from '../langchain/langchain.service';
import { createSectionContentPrompt } from '../langchain/prompt-templates/learning-guide';
import { SectionContentSchema } from '../langchain/schemas/section-content.schema';
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
      const completedSections: Array<{ title: string; keywords?: string[] }> = [];

      for (let i = 0; i < sections.length; i++) {
        await this.generateSection(
          contentId,
          userId,
          i,
          sections[i],
          topic,
          sourceContent,
          sections.length,
          completedSections,
        );

        completedSections.push(sections[i]);

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
    sourceContent: string,
    totalSections: number,
    completedSections: Array<{ title: string; keywords?: string[] }>,
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
      // Check if section already has content (e.g., pre-generated first section)
      const content = await this.prisma.content.findUnique({
        where: { id: contentId },
        select: { learningGuide: true },
      });

      const learningGuide = content?.learningGuide as any;
      const existingSection = learningGuide?.sections?.[sectionIndex];

      if (existingSection?.content && existingSection.content.length > 0) {
        this.logger.log(
          `Content ${contentId}: Section ${sectionIndex + 1} ("${title}") already has content. Skipping generation.`
        );

        // Emit section completed event to keep UI/UX consistent
        this.eventEmitter.emit(
          EVENTS.LEARNING_GUIDE.SECTION_COMPLETED,
          EventFactory.learningGuideSectionCompleted(
            userId,
            contentId,
            sectionIndex
          )
        );
        return;
      }

      const prompt = createSectionContentPrompt();

      const sectionPosition = this.formatSectionPosition(sectionIndex, totalSections);
      const previousSections = this.formatPreviousSections(completedSections);

      const parsed = await this.langchainService.invokeChain(
        prompt,
        SectionContentSchema,
        {
          sectionTitle: title,
          keywords: keywords.join(', ') || 'General concepts',
          topic,
          sectionPosition,
          sourceContent: sourceContent || '[No source content provided]',
          previousSections,
        },
        {
          task: 'section-generation',
          userId,
        },
      );

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

  private formatSectionPosition(index: number, total: number): string {
    const position = index + 1;
    let phase: string;

    const ratio = position / total;
    if (ratio <= 0.3) {
      phase = 'foundational — focus on definitions, core concepts, and building understanding';
    } else if (ratio <= 0.7) {
      phase = 'application — focus on using concepts in scenarios, making connections, and comparing approaches';
    } else {
      phase = 'synthesis — focus on integration, advanced patterns, edge cases, and evaluation';
    }

    return `Section ${position} of ${total} (${phase})`;
  }

  private formatPreviousSections(
    completed: Array<{ title: string; keywords?: string[] }>,
  ): string {
    if (completed.length === 0) {
      return 'This is the first section — no prior content has been covered yet.';
    }

    return completed
      .map(
        (s, i) =>
          `${i + 1}. "${s.title}"${s.keywords?.length ? ` — Covered: ${s.keywords.join(', ')}` : ''}`,
      )
      .join('\n');
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
