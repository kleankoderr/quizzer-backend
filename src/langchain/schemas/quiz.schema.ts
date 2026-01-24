import { z } from 'zod';

/**
 * Quiz question schema
 */
export const QuizQuestionSchema = z.object({
  question: z
    .string()
    .min(10, 'Question must be at least 10 characters')
    .max(500, 'Question must be at most 500 characters'),
  options: z.array(z.string()).optional(),
  questionType: z
    .enum([
      'true-false',
      'single-select',
      'multi-select',
      'matching',
      'fill-blank',
    ])
    .describe(
      'Question type (true-false, single-select, multi-select, matching, fill-blank)'
    ),
  correctAnswer: z
    .union([
      z.number(),
      z.array(z.number()),
      z.array(z.object({ key: z.string(), value: z.string() })),
      z.array(z.string()),
    ])
    .describe('Correct answer for the question'),
  explanation: z
    .string()
    .min(20, 'Explanation must be at least 20 characters')
    .max(500, 'Explanation must be at most 500 characters'),
  citation: z.string().optional().describe('Citation of the question'),
  leftColumn: z
    .array(z.string())
    .optional()
    .describe('Left column of the question'),
  rightColumn: z
    .array(z.string())
    .optional()
    .describe('Right column of the question'),
});

/**
 * Quiz generation response schema
 */
export const QuizGenerationSchema = z.object({
  title: z.string().describe('A creative and descriptive title for the quiz'),
  topic: z.string().optional().describe('General topic of the quiz'),
  questions: z
    .array(QuizQuestionSchema)
    .min(1, 'Must have at least 1 question'),
});

export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type QuizGeneration = z.infer<typeof QuizGenerationSchema>;

/**
 * Concept extraction schema
 */
export const ConceptListSchema = z.object({
  concepts: z
    .array(z.string())
    .describe('A list of concepts extracted from content'),
});
