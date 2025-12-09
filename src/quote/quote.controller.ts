import { Controller, Get } from '@nestjs/common';
import { QuoteService } from './quote.service';

@Controller('quotes')
export class QuoteController {
  constructor(private readonly quoteService: QuoteService) {}

  @Get('daily')
  async getDailyQuote() {
    return this.quoteService.getDailyQuote();
  }
}
