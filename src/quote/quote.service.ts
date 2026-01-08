import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CacheService } from '../common/services/cache.service';

export interface Quote {
  q: string; // quote text
  a: string; // author
  h: string; // html
}

@Injectable()
export class QuoteService {
  private readonly logger = new Logger(QuoteService.name);
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  constructor(
    private readonly httpService: HttpService,
    private readonly cacheService: CacheService
  ) {}

  /**
   * Get daily quote for a specific user
   * Generates a new quote once per day per user
   */
  async getDailyQuote(
    userId: string
  ): Promise<{ text: string; author: string }> {
    // Create a cache key with userId and current date (YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `daily_quote:${userId}:${today}`;

    // Check if quote exists in cache
    const cachedQuote = await this.getCachedQuote(cacheKey);
    if (cachedQuote) {
      this.logger.debug(`Cache hit for user ${userId}'s daily quote`);
      return cachedQuote;
    }

    // Generate and cache new quote
    this.logger.log(`Generating new daily quote for user ${userId}`);
    return this.fetchAndCacheQuote(cacheKey, userId);
  }

  /**
   * Get quote from cache
   */
  private async getCachedQuote(
    cacheKey: string
  ): Promise<{ text: string; author: string } | null> {
    try {
      return await this.cacheService.get<{ text: string; author: string }>(
        cacheKey
      );
    } catch (error) {
      this.logger.warn(`Cache retrieval failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Fetch a new quote from API and cache it
   */
  private async fetchAndCacheQuote(
    cacheKey: string,
    userId: string
  ): Promise<{ text: string; author: string }> {
    try {
      // Fetch a batch of quotes to filter from
      const response = await firstValueFrom(
        this.httpService.get<Quote[]>('https://zenquotes.io/api/quotes')
      );

      if (response.data && response.data.length > 0) {
        // Filter for motivational/educational keywords
        const keywords = [
          'success',
          'learn',
          'education',
          'confidence',
          'wisdom',
          'mind',
          'future',
          'goal',
          'knowledge',
          'study',
          'growth',
        ];

        const relevantQuotes = response.data.filter((q) =>
          keywords.some((k) => q.q.toLowerCase().includes(k))
        );

        // Select a random relevant quote, or fallback to random from all
        const quotesToChooseFrom =
          relevantQuotes.length > 0 ? relevantQuotes : response.data;
        const selectedQuote =
          quotesToChooseFrom[
            Math.floor(Math.random() * quotesToChooseFrom.length)
          ];

        const formattedQuote = {
          text: selectedQuote.q,
          author: selectedQuote.a,
        };

        // Cache the quote for 24 hours
        await this.cacheQuote(cacheKey, formattedQuote);

        this.logger.log(
          `Daily quote cached for user ${userId}: "${formattedQuote.text}"`
        );
        return formattedQuote;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fetch quote from API for user ${userId}, using fallback`,
        error.message
      );
    }

    // Fallback quote if API fails
    const fallbackQuote = this.getFallbackQuote();
    await this.cacheQuote(cacheKey, fallbackQuote);
    return fallbackQuote;
  }

  /**
   * Cache a quote
   */
  private async cacheQuote(
    cacheKey: string,
    quote: { text: string; author: string }
  ): Promise<void> {
    try {
      await this.cacheService.set(cacheKey, quote, this.CACHE_TTL);
    } catch (error) {
      this.logger.warn(`Failed to cache quote: ${error.message}`);
    }
  }

  /**
   * Get a fallback quote when API fails
   */
  private getFallbackQuote(): { text: string; author: string } {
    const fallbackQuotes = [
      {
        text: 'The expert in anything was once a beginner.',
        author: 'Helen Hayes',
      },
      {
        text: 'Education is the most powerful weapon which you can use to change the world.',
        author: 'Nelson Mandela',
      },
      {
        text: 'The beautiful thing about learning is that no one can take it away from you.',
        author: 'B.B. King',
      },
      {
        text: 'Success is the sum of small efforts repeated day in and day out.',
        author: 'Robert Collier',
      },
    ];

    return fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
  }
}
