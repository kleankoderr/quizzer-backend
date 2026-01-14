import { z } from 'zod';

/**
 * Learning guide section schema
 */
export const LearningGuideSectionSchema = z.object({
  title: z.string(),
  content: z.string().min(50, 'Section content must be at least 50 characters'),
  example: z.string().optional(),
  knowledgeCheck: z
    .object({
      question: z.string(),
      options: z.array(z.string()).length(4),
      correctAnswer: z.number().min(0).max(3),
      explanation: z.string(),
    })
    .optional(),
});

/**
 * Learning guide schema
 */
export const LearningGuideSchema = z.object({
  title: z.string(),
  topic: z.string(),
  description: z.string().min(50, 'Description must be at least 50 characters'),
  learningGuide: z.object({
    sections: z
      .array(LearningGuideSectionSchema)
      .min(1, 'Must have at least 1 section'),
  }),
});

export type LearningGuideSection = z.infer<typeof LearningGuideSectionSchema>;
export type LearningGuide = z.infer<typeof LearningGuideSchema>;
