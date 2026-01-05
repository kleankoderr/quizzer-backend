import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  getHello(): string {
    return 'Welcome to Quizzer API - AI-Powered Quiz & Flashcard Generation';
  }
}
