import { z } from 'zod';

export const RecommendationSchema = z.object({
  topic: z.string().describe('Specific topic name from the weak topics list'),
  reason: z
    .string()
    .describe(
      'Data-driven explanation referencing performance patterns or gaps'
    ),
  priority: z
    .enum(['high', 'medium', 'low'])
    .describe('Priority level based on performance gaps'),
});

export const RecommendationListSchema = z
  .array(RecommendationSchema)
  .min(1)
  .describe('A list of personalized learning recommendations');
