import { z } from 'zod';

/**
 * Flashcard schema
 */
export const FlashcardSchema = z.object({
  front: z.string().min(5, 'Front must be at least 5 characters'),
  back: z.string().min(10, 'Back must be at least 10 characters'),
  tags: z.array(z.string()).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

/**
 * Flashcard set generation schema
 */
export const FlashcardSetSchema = z.object({
  cards: z.array(FlashcardSchema).min(1, 'Must have at least 1 flashcard'),
  title: z.string().optional(),
  description: z.string().optional(),
});

export type Flashcard = z.infer<typeof FlashcardSchema>;
export type FlashcardSet = z.infer<typeof FlashcardSetSchema>;
