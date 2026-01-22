import { z } from 'zod';

export const RecommendationSchema = z.object({
  topic: z
    .string()
    .describe('Specific topic name from the weak topics list')
    .describe('Topic of the recommendation'),
  reason: z
    .string()
    .describe(
      'Data-driven explanation referencing performance patterns or gaps'
    )
    .describe('Reason for the recommendation'),
  priority: z
    .enum(['high', 'medium', 'low'])
    .describe('Priority level based on performance gaps')
    .describe('Priority of the recommendation'),
});

export const RecommendationListSchema = z
  .array(RecommendationSchema)
  .min(1)
  .describe('A list of personalized learning recommendations')
  .describe('Recommendations for the user');
