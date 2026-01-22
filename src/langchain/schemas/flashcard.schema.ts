import { z } from 'zod';

/**
 * Flashcard schema
 */
export const FlashcardSchema = z.object({
  front: z.string().min(20, 'Front must be at least 5 characters').describe('Front of the flashcard'),
  back: z.string().min(20, 'Back must be at least 5 characters').describe('Back of the flashcard'),
  explanation: z.string().min(20, 'Explanation must be at least 5 characters').describe('Explanation of the flashcard'),
  tags: z.array(z.string()).optional().describe('Tags of the flashcard'),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().describe('Difficulty level of the flashcard'),
});

/**
 * Flashcard set generation schema
 */
export const FlashcardSetSchema = z.object({
  cards: z.array(FlashcardSchema).min(1, 'Must have at least 1 flashcard').describe('Flashcards of the flashcard set'),
  title: z.string().describe('Title of the flashcard set'),
  description: z.string().optional().describe('Description of the flashcard set'),
});

export type Flashcard = z.infer<typeof FlashcardSchema>;
export type FlashcardSet = z.infer<typeof FlashcardSetSchema>;
