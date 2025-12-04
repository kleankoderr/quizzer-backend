import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { Cron, CronExpression } from "@nestjs/schedule";
import { firstValueFrom } from "rxjs";
import { Cache } from "cache-manager";
import { Inject } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";

export interface Quote {
  q: string; // quote text
  a: string; // author
  h: string; // html
}

@Injectable()
export class QuoteService implements OnModuleInit {
  private readonly logger = new Logger(QuoteService.name);
  private readonly CACHE_KEY = "daily_quote";

  constructor(
    private readonly httpService: HttpService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async onModuleInit() {
    await this.getDailyQuote();
  }

  async getDailyQuote(): Promise<{ text: string; author: string }> {
    const cachedQuote = await this.cacheManager.get<{
      text: string;
      author: string;
    }>(this.CACHE_KEY);
    if (cachedQuote) {
      return cachedQuote;
    }

    return this.fetchAndCacheQuote();
  }

  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async handleDailyQuoteRefresh() {
    this.logger.log("Refreshing daily quote...");
    await this.fetchAndCacheQuote();
  }

  private async fetchAndCacheQuote(): Promise<{
    text: string;
    author: string;
  }> {
    try {
      // Fetch a batch of 50 quotes to filter from
      const response = await firstValueFrom(
        this.httpService.get<Quote[]>("https://zenquotes.io/api/quotes"),
      );

      if (response.data && response.data.length > 0) {
        // Filter for keywords
        const keywords = [
          "success",
          "learn",
          "education",
          "confidence",
          "wisdom",
          "mind",
          "future",
          "goal",
        ];
        const relevantQuotes = response.data.filter((q) =>
          keywords.some((k) => q.q.toLowerCase().includes(k)),
        );

        // Use a relevant quote if found, otherwise just the first one (or random from batch)
        const selectedQuote =
          relevantQuotes.length > 0
            ? relevantQuotes[Math.floor(Math.random() * relevantQuotes.length)]
            : response.data[0];

        const formattedQuote = {
          text: selectedQuote.q,
          author: selectedQuote.a,
        };

        await this.cacheManager.set(
          this.CACHE_KEY,
          formattedQuote,
          25 * 60 * 60 * 1000,
        );
        this.logger.log(`Daily quote updated: "${formattedQuote.text}"`);
        return formattedQuote;
      }
    } catch (error) {
      this.logger.warn(
        "Failed to fetch daily quote from API, using fallback",
        error,
      );
    }

    // Fallback quote if API fails
    return {
      text: "The expert in anything was once a beginner.",
      author: "Helen Hayes",
    };
  }
}
