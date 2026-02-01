import { registerAs } from '@nestjs/config';

export default registerAs('aiConcurrency', () => ({
  // Learning guide section generation
  sections: Number.parseInt(process.env.AI_CONCURRENCY_SECTIONS || '3', 10),

  // Quiz question chunk generation
  quizChunks: Number.parseInt(
    process.env.AI_CONCURRENCY_QUIZ_CHUNKS || '2',
    10
  ),

  // Flashcard chunk generation
  flashcardChunks: Number.parseInt(
    process.env.AI_CONCURRENCY_FLASHCARD_CHUNKS || '2',
    10
  ),

  // Retry configuration
  retryAttempts: Number.parseInt(process.env.AI_RETRY_ATTEMPTS || '2', 10),
  retryDelayMs: Number.parseInt(process.env.AI_RETRY_DELAY_MS || '2000', 10),
}));
