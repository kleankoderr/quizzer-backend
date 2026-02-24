import { z } from 'zod';

/**
 * Knowledge check schema shared between outline and section content.
 * Uses .describe() to guide the model via withStructuredOutput().
 */
export const KnowledgeCheckSchema = z.object({
  question: z
    .string()
    .describe(
      'A scenario-based question at Bloom\'s Apply/Analyze level. ' +
      'Present a realistic situation, then ask what the learner would do, conclude, or identify. ' +
      'Never test pure recall or definitions.',
    ),
  options: z
    .array(z.string())
    .describe(
      'Exactly 4 plausible answer choices, parallel in structure and similar in length. ' +
      'Distractors should reflect real misconceptions, not obviously wrong answers.',
    ),
  correctAnswer: z
    .number()
    .describe('Index (0-3) of the correct option. Vary across questions — no patterns.'),
  explanation: z
    .string()
    .describe(
      'Teaching explanation: why the correct answer works AND why each distractor is wrong. ' +
      '2-4 sentences that reinforce the underlying concept.',
    ),
});

/**
 * A single section in the learning guide outline.
 * First section includes full content; subsequent sections are title + keywords only.
 */
const OutlineSectionSchema = z.object({
  title: z
    .string()
    .describe(
      'Specific, descriptive section title. Action-oriented. ' +
      'Good: "Understanding Variables and Data Types". Bad: "Introduction".',
    ),
  keywords: z
    .array(z.string())
    .optional()
    .describe('3-5 key terms or concepts this section will teach'),
  content: z
    .string()
    .optional()
    .describe(
      'Full markdown teaching content for the FIRST section only (300-500 words). ' +
      'Hook → core explanation with formatting → key takeaway.',
    ),
  example: z
    .string()
    .optional()
    .describe(
      'Worked scenario for the FIRST section only (150-200 words). ' +
      'Present a realistic situation, walk through the concept step-by-step, show the outcome.',
    ),
  knowledgeCheck: KnowledgeCheckSchema
    .optional()
    .describe('Scenario-based assessment for the FIRST section only'),
});

/**
 * Schema for the learning guide outline generation.
 * Used with model.withStructuredOutput() for type-safe, validated responses.
 */
export const LearningGuideOutlineSchema = z.object({
  title: z
    .string()
    .describe('Descriptive guide title that clearly communicates what learners will master'),
  topic: z
    .string()
    .describe('Main topic of the learning guide (2-4 words)'),
  description: z
    .string()
    .describe(
      '2-3 sentences: what learners will be able to do after completing this guide and why it matters. ' +
      'Focus on outcomes, not process.',
    ),
  sections: z
    .array(OutlineSectionSchema)
    .describe(
      '8-15 sections in progressive learning order. ' +
      'Early sections: foundations (Remember/Understand). ' +
      'Middle: application (Apply/Analyze). ' +
      'Late: synthesis (Evaluate/Create). ' +
      'First section has full content + example + knowledgeCheck. Rest have title + keywords only.',
    ),
});

export type LearningGuideOutline = z.infer<typeof LearningGuideOutlineSchema>;
export type OutlineSection = z.infer<typeof OutlineSectionSchema>;
