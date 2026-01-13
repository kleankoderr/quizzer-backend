import { z } from 'zod';

/**
 * Quiz question schema
 */
export const QuizQuestionSchema = z.object({
  question: z.string().min(10, 'Question must be at least 10 characters'),
  options: z.array(z.string()).length(4, 'Must have exactly 4 options'),
  correctAnswer: z.number().int().min(0).max(3, 'Correct answer must be 0-3'),
  explanation: z.string().min(20, 'Explanation must be at least 20 characters'),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  topic: z.string().optional(),
});

/**
 * Quiz generation response schema
 */
export const QuizGenerationSchema = z.object({
  questions: z
    .array(QuizQuestionSchema)
    .min(1, 'Must have at least 1 question'),
  metadata: z
    .object({
      totalQuestions: z.number(),
      difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
      estimatedTime: z.number().optional(),
    })
    .optional(),
});

export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type QuizGeneration = z.infer<typeof QuizGenerationSchema>;
