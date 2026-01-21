import { Injectable } from '@nestjs/common';
import { InputHandler } from './handlers/input-handler.abstract';
import { InputSource, InputSourceType } from './input-source.interface';

/**
 * Orchestrates input processing through registered handlers
 * Applies input precedence rules when combining sources
 */
@Injectable()
export class InputPipeline {
  private handlerChain: InputHandler | null = null;

  /**
   * Register handlers in order of priority
   * Handlers will be chained together via Chain of Responsibility pattern
   *
   * @param handlers Array of input handlers to register
   */
  registerHandlers(handlers: InputHandler[]): void {
    if (handlers.length === 0) return;

    this.handlerChain = handlers[0];
    let current = this.handlerChain;

    for (let i = 1; i < handlers.length; i++) {
      current = current.setNext(handlers[i]);
    }
  }

  /**
   * Process DTO through the handler chain
   * Each handler checks if it can process the DTO and extracts relevant input sources
   *
   * @param dto Input data transfer object
   * @returns Array of all processed input sources
   * @throws Error if no handlers are registered or no sources could be processed
   */
  async process(dto: any): Promise<InputSource[]> {
    if (!this.handlerChain) {
      throw new Error('No input handlers registered in pipeline');
    }

    const sources = await this.handlerChain.handle(dto);

    // Fail if no sources were successfully processed
    if (sources.length === 0) {
      throw new Error(
        'No valid input sources could be processed. Please provide at least one of: topic, content, or files.'
      );
    }

    return sources;
  }

  /**
   * Combine multiple input sources into a single content string
   *
   * Applies input precedence rules: FILE > CONTENT > TITLE
   * - If FILE sources exist, only use FILE content (ignore CONTENT and TITLE)
   * - If CONTENT sources exist (no FILE), only use CONTENT (ignore TITLE)
   * - Otherwise, use TITLE only
   *
   * @param sources Array of input sources from handlers
   * @returns Combined content string for AI generation
   */
  combineInputSources(sources: InputSource[]): string {
    if (sources.length === 0) return '';

    // Apply precedence: FILE > CONTENT > TITLE
    const hasFile = sources.some((s) => s.type === InputSourceType.FILE);
    const hasContent = sources.some((s) => s.type === InputSourceType.CONTENT);

    // Filter based on precedence rules
    let applicableSources = sources;
    if (hasFile) {
      // FILE takes highest precedence - only use file sources
      applicableSources = sources.filter(
        (s) => s.type === InputSourceType.FILE
      );
    } else if (hasContent) {
      // CONTENT takes precedence over TITLE
      applicableSources = sources.filter(
        (s) => s.type === InputSourceType.CONTENT
      );
    }
    // Otherwise use TITLE (lowest precedence)

    return applicableSources
      .map((source) => {
        if (source.type === InputSourceType.TITLE) {
          // Simple content for title, no special formatting
          return source.content;
        }

        if (source.metadata.originalName) {
          // Format file/media sources with headers
          return `\n\n=== Content from ${source.metadata.originalName} ===\n${source.content}\n`;
        }

        // Plain content for other types
        return source.content;
      })
      .join('\n');
  }
}
