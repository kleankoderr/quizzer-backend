import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { QuoteService } from './quote.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Quotes')
@Controller('quotes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class QuoteController {
  constructor(private readonly quoteService: QuoteService) {}

  @Get('daily')
  @ApiOperation({
    summary: 'Get daily motivational quote for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns a unique daily quote for the user',
    schema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          example: 'The expert in anything was once a beginner.',
        },
        author: { type: 'string', example: 'Helen Hayes' },
      },
    },
  })
  async getDailyQuote(@CurrentUser('sub') userId: string) {
    return this.quoteService.getDailyQuote(userId);
  }
}
