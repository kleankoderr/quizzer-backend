import { Injectable, Logger } from '@nestjs/common';
import { ModelConfigService } from './model-config.service';
import { z } from 'zod';
import { JsonParseResult, safeJsonParse } from '../common/helpers/json-parser.helper';

export interface InvokeContext {
  userId?: string;
  jobId?: string;
  task?: string;
}

@Injectable()
export class LangChainService {
  private readonly logger = new Logger(LangChainService.name);
  private readonly DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes
  private readonly JSON_PARSER_TIMEOUT_MS = 300_000; // 5 minutes

  constructor(private readonly modelConfig: ModelConfigService) {}

  /**
   * Invoke with structured output (Zod schema validation)
   * Includes performance tracking and timeout handling
   */
  async invokeWithStructure<T>(
    schema: z.ZodType<T>,
    prompt: string,
    context?: InvokeContext
  ): Promise<Record<string, any>> {
    const startTime = Date.now();
    const contextStr = context ? `[${context.task || 'unknown'}]` : '';

    this.logger.log(`${contextStr} Starting structured model invocation`);

    try {
      const model = this.modelConfig.getModel();

      // Create structured model with explicit options
      const structuredModel = model.withStructuredOutput(schema);

      // Invoke with timeout
      const response = await this.withTimeout(
        structuredModel.invoke(prompt),
        this.DEFAULT_TIMEOUT_MS,
        'Model invocation timed out. Please try again.'
      );

      const latency = Date.now() - startTime;
      this.logger.log(
        `${contextStr} Model invocation successful (${latency}ms)`
      );

      return response;
    } catch (err) {
      const latency = Date.now() - startTime;
      this.logger.error(
        `${contextStr} Model invocation failed after ${latency}ms: ${err.message}`,
        err.stack
      );

      // Provide user-friendly error message
      if (err.message?.includes('timeout')) {
        throw new Error(
          'The AI is taking too long to respond. Please try again with a shorter prompt or fewer items.'
        );
      }

      throw new Error('Failed to generate content. Please try again.');
    }
  }

  /**
   * Invoke without structure (returns string)
   */
  async invoke(prompt: string, context?: InvokeContext): Promise<string> {
    const startTime = Date.now();
    const contextStr = context ? `[${context.task || 'unknown'}]` : '';

    this.logger.log(`${contextStr} Starting text model invocation`);

    try {
      const model = this.modelConfig.getModel();
      const response = await this.withTimeout(
        model.invoke(prompt),
        this.DEFAULT_TIMEOUT_MS,
        'Model invocation timed out. Please try again.'
      );

      const latency = Date.now() - startTime;
      this.logger.log(
        `${contextStr} Text invocation successful (${latency}ms)`
      );

      return response.content as string;
    } catch (err) {
      const latency = Date.now() - startTime;
      this.logger.error(
        `${contextStr} Text invocation failed after ${latency}ms: ${err.message}`
      );
      throw new Error('Failed to generate text. Please try again.');
    }
  }

  /**
   * Stream responses
   */
  async *stream(
    prompt: string,
    context?: InvokeContext
  ): AsyncIterable<string> {
    const contextStr = context ? `[${context.task || 'unknown'}]` : '';
    this.logger.log(`${contextStr} Starting streaming invocation`);

    const model = this.modelConfig.getModel();
    const stream = await model.stream(prompt);

    for await (const chunk of stream) {
      yield chunk.content as string;
    }
  }

  /**
   * Invoke with JSON parser fallback (for models that don't support structured output well)
   */
  async invokeWithJsonParser(
    prompt: string,
    context?: InvokeContext
  ): Promise<Record<string, any>> {
    const contextStr = context ? `[${context.task || 'unknown'}]` : '';
    const startTime = Date.now();

    try {
      this.logger.log(`${contextStr} Starting JSON parser invocation`);

      const model = this.modelConfig.getModel();
      const response = await this.withTimeout(
        model.invoke(prompt),
        this.JSON_PARSER_TIMEOUT_MS,
        'Model invocation timed out during JSON parsing.'
      );
      const content = response.content as string;

      const parseResult: JsonParseResult = safeJsonParse(content);

      if (!parseResult.success) {
        const textSample = content.substring(0, 500);
        this.logger.error(
          `${contextStr} All JSON extraction strategies failed. Text sample: ${textSample}`
        );
        throw new Error('Could not extract valid JSON from response');
      }

      this.logger.debug(
        `${contextStr} JSON parsed successfully using strategy: ${parseResult.strategy}`
      );

      const latency = Date.now() - startTime;
      this.logger.log(`${contextStr} JSON parsing successful (${latency}ms)`);

      return parseResult.data as Record<string, any>;
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `${contextStr} JSON parsing failed after ${latency}ms: ${errorMessage}`
      );

      throw new Error(
        'Failed to generate valid content. Please try again or simplify your request.'
      );
    }
  }

  /**
   * Timeout wrapper for promises
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
      ),
    ]);
  }
}
