import { Injectable } from '@nestjs/common';
import { InputHandler } from './input-handler.abstract';
import { InputSource, InputSourceType } from '../input-source.interface';

/**
 * Handles title/topic input
 * Checks for dto.topic or dto.title
 */
@Injectable()
export class TitleInputHandler extends InputHandler {
  protected canHandle(dto: any): boolean {
    return !!(dto.topic || dto.title);
  }

  protected async processInput(dto: any): Promise<InputSource[]> {
    const title = dto.topic || dto.title;

    return [
      {
        type: InputSourceType.TITLE,
        content: title,
        metadata: {},
      },
    ];
  }
}
