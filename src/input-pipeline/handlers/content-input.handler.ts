import { Injectable } from '@nestjs/common';
import { InputHandler } from './input-handler.abstract';
import { InputSource, InputSourceType } from '../input-source.interface';

/**
 * Handles raw text content input
 * Checks for dto.content
 */
@Injectable()
export class ContentInputHandler extends InputHandler {
  protected canHandle(dto: any): boolean {
    return !!dto.content;
  }

  protected async processInput(dto: any): Promise<InputSource[]> {
    return [
      {
        type: InputSourceType.CONTENT,
        content: dto.content,
        metadata: {},
      },
    ];
  }
}
