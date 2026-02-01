import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

export interface HashInput {
  topic?: string;
  sourceText?: string;
  fileIds?: string[];
  parameters?: Record<string, any>;
}

@Injectable()
export class GenerationHashService {
  private readonly logger = new Logger(GenerationHashService.name);

  /**
   * Generates a stable SHA-256 hash from content generation parameters.
   * Ensures that identical requests map to the same hash.
   */
  calculateHash(input: HashInput): string {
    const { topic, sourceText, fileIds, parameters } = input;

    // Normalize and sort file IDs to ensure stable hashing
    const normalizedFileIds = fileIds
      ? [...fileIds].sort((idA, idB) => idA.localeCompare(idB))
      : [];

    // Stringify and normalize parameters (sort keys)
    const normalizedParams = parameters
      ? JSON.stringify(
          Object.keys(parameters)
            .sort((keyA, keyB) => keyA.localeCompare(keyB))
            .reduce((obj, key) => {
              obj[key] = parameters[key];
              return obj;
            }, {})
        )
      : '';

    const payload = [
      topic?.trim().toLowerCase() || '',
      sourceText?.trim() || '',
      normalizedFileIds.join(','),
      normalizedParams,
    ].join('|');

    return createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Specifically for Learning Guide generation
   */
  forContent(topic: string, content?: string, fileIds?: string[]): string {
    return this.calculateHash({ topic, sourceText: content, fileIds });
  }

  /**
   * Specifically for Quiz generation
   */
  forQuiz(
    topic: string,
    numQuestions: number,
    difficulty: string,
    type: string,
    fileIds?: string[]
  ): string {
    return this.calculateHash({
      topic,
      fileIds,
      parameters: { numQuestions, difficulty, type },
    });
  }

  /**
   * Specifically for Flashcard generation
   */
  forFlashcards(topic: string, numCards: number, fileIds?: string[]): string {
    return this.calculateHash({
      topic,
      fileIds,
      parameters: { numCards },
    });
  }
}
