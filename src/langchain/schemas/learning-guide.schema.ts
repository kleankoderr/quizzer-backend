import { z } from 'zod';

/**
 * Learning guide section schema
 */
export const LearningGuideSectionSchema = z.object({
  title: z.string().describe('Title of the section'),
  content: z.string().min(50, 'Section content must be at least 50 characters').describe('Content of the section'),
  example: z.string().optional().describe('Example of the section'),
  knowledgeCheck: z
    .object({
      question: z.string().describe('Question of the knowledge check'),
      options: z.array(z.string()).length(4).describe('Options of the knowledge check'),
      correctAnswer: z.number().min(0).max(3).describe('Correct answer of the knowledge check'),
      explanation: z.string().describe('Explanation of the knowledge check'),
    })
});

/**
 * Learning guide schema
 */
export const LearningGuideSchema = z.object({
  title: z.string().describe('Title of the learning guide'),
  topic: z.string().describe('Topic of the learning guide'),
  description: z.string().min(50, 'Description must be at least 50 characters').describe('Description of the learning guide'),
  learningGuide: z.object({
    sections: z
      .array(LearningGuideSectionSchema)
      .min(1, 'Must have at least 1 section'),
  }),
});

export type LearningGuideSection = z.infer<typeof LearningGuideSectionSchema>;
export type LearningGuide = z.infer<typeof LearningGuideSchema>;
