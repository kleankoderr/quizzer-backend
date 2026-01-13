import { z } from 'zod';

/**
 * Learning guide section schema
 */
export const LearningGuideSectionSchema = z.object({
  heading: z.string(),
  content: z.string().min(50, 'Section content must be at least 50 characters'),
  keyPoints: z.array(z.string()),
  examples: z.array(z.string()).optional(),
});

/**
 * Learning guide schema
 */
export const LearningGuideSchema = z.object({
  title: z.string(),
  overview: z.string().min(100, 'Overview must be at least 100 characters'),
  sections: z
    .array(LearningGuideSectionSchema)
    .min(1, 'Must have at least 1 section'),
  summary: z.string().min(50, 'Summary must be at least 50 characters'),
  suggestedTopics: z.array(z.string()).optional(),
  prerequisites: z.array(z.string()).optional(),
});

export type LearningGuideSection = z.infer<typeof LearningGuideSectionSchema>;
export type LearningGuide = z.infer<typeof LearningGuideSchema>;
