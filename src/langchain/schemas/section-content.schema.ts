import { z } from 'zod';
import { KnowledgeCheckSchema } from './learning-guide-outline.schema';

/**
 * Schema for individual section content generation.
 * Used with model.withStructuredOutput() for type-safe, validated responses.
 *
 * This schema matches what SectionGenerationProcessor expects
 * when generating content for each learning guide section.
 */
export const SectionContentSchema = z.object({
  title: z
    .string()
    .describe('The section title (must match the assigned section title)'),
  content: z
    .string()
    .describe(
      'Markdown teaching content (300-500 words). Structure: ' +
      '1-2 sentence hook → core explanation with headers, bullets, bold terms, ' +
      'and appropriate formats (code, formulas, tables, diagrams) → key takeaway. ' +
      'Short paragraphs only (2-3 sentences max). Build on previously covered material.',
    ),
  example: z
    .string()
    .describe(
      'A concrete worked scenario (150-250 words) demonstrating the concept in a realistic situation. ' +
      'Walk through step-by-step with visible reasoning. Show the outcome.',
    ),
  knowledgeCheck: KnowledgeCheckSchema.describe(
    'One scenario-based question at Bloom\'s Apply/Analyze level with 4 plausible options',
  ),
});

export type SectionContent = z.infer<typeof SectionContentSchema>;
